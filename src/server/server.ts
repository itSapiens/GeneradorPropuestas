import express from "express";
import cors from "cors";
import multer from "multer";
import {
  sendProposalEmail,
  sendBankTransferReservationEmail,
} from "../services/mailer.service";
import {
  DEFAULT_SIGNAL_AMOUNT_EUR,
  PORT,
  SAPIENS_CONTACT_EMAIL,
  SAPIENS_CONTACT_PHONE,
} from "./config/env";
import { supabase } from "./clients/supabaseClient";
import { registerConfirmStudyRoutes } from "./routes/confirmStudyRoutes";
import { registerCoreRoutes } from "./routes/coreRoutes";
import { registerExtractionRoutes } from "./routes/extractionRoutes";
import { registerGeocodingRoutes } from "./routes/geocodingRoutes";
import { registerInstallationsRoutes } from "./routes/installationsRoutes";
import { registerSpaRoutes } from "./routes/spaRoutes";
import { registerStripeCheckoutRoutes } from "./routes/stripeCheckoutRoutes";
import { registerStripeWebhookRoute } from "./routes/stripeWebhookRoutes";
import {
  getAllowedProposalModes,
  normalizeAppLanguage,
  resolveProposalMode,
} from "./services/contractLocalizationService";
import {
  createProposalContinueAccessToken,
  normalizeDni,
  normalizeIdentityText,
  sha256,
  signContractResumeToken,
  verifyContractResumeToken,
} from "./services/contractAccessService";
import { getContractContextFromStudy } from "./services/contractContextService";
import { buildBasicContractHtml } from "./services/contractHtmlService";
import {
  buildContractFileName,
  buildContractNumber,
  downloadDriveFileAsBuffer,
  ensureContractsStatusFolder,
  uploadBufferToDrive,
} from "./services/driveStorageService";
import {
  GeocodeError,
  geocodeAddressWithGoogle,
} from "./services/geocodingService";
import {
  findEligibleInstallationsForStudy,
  resolveInstallationBankIban,
  resolveReservationAmountForInstallation,
} from "./services/installationAssignmentService";
import { createCheckoutSessionForReservation } from "./services/reservationCheckoutService";
import { sendReservationConfirmationAfterPayment } from "./services/reservationConfirmationService";
import {
  parseMaybeJson,
  toNullableNumber,
  toPositiveNumber,
} from "./utils/parsingUtils";
import { normalizeDriveToken, pickFirstString } from "./utils/stringUtils";

export async function startServer() {
  const app = express();

  app.use(cors());
  registerStripeWebhookRoute(app, {
    sendReservationConfirmationAfterPayment,
  });

  app.use(express.json({ limit: "10mb" }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 15 * 1024 * 1024,
    },
  });

  registerCoreRoutes(app);
  registerExtractionRoutes(app, upload);

  registerConfirmStudyRoutes(app, upload);

  registerStripeCheckoutRoutes(app);

  app.post("/api/studies/:id/send-proposal-email", async (req, res) => {
    try {
      const { id } = req.params;

      const { data: study, error: studyError } = await supabase
        .from("studies")
        .select("*")
        .eq("id", id)
        .single();

      if (studyError || !study) {
        return res.status(404).json({
          error: "Study not found",
          details: studyError?.message ?? "El estudio no existe",
        });
      }

      const customer = study.customer ?? {};
      const sourceFile = study.source_file ?? {};

      const email =
        pickFirstString(
          req.body?.email,
          customer?.email,
          customer?.correo,
          customer?.mail,
        ) ?? null;

      const nombre =
        pickFirstString(customer?.nombre, customer?.name, "Cliente") ??
        "Cliente";

      const apellidos =
        pickFirstString(
          customer?.apellidos,
          customer?.lastName,
          customer?.surnames,
        ) ?? "";

      const proposalDriveFileId =
        pickFirstString(
          sourceFile?.proposal_drive_file_id,
          sourceFile?.propuesta_drive_file_id,
        ) ?? null;

      const proposalUrl =
        pickFirstString(
          sourceFile?.proposal_drive_url,
          sourceFile?.propuesta_drive_url,
        ) ?? null;

      if (!email) {
        return res.status(400).json({
          error: "No se encontró el email del cliente",
        });
      }

      if (!proposalDriveFileId) {
        return res.status(400).json({
          error: "No se encontró el PDF de propuesta en Drive",
        });
      }

      const driveProposal =
        await downloadDriveFileAsBuffer(proposalDriveFileId);

      const clientDni =
        pickFirstString(customer?.dni, customer?.documentNumber) ?? null;

      if (!clientDni) {
        return res.status(400).json({
          error: "No se encontró el DNI del cliente en el estudio",
        });
      }

      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("dni", clientDni)
        .single();

      if (clientError || !client) {
        return res.status(404).json({
          error: "No se encontró el cliente asociado al estudio",
          details: clientError?.message ?? "Cliente no encontrado",
        });
      }

      const language = normalizeAppLanguage(study.language);
      const access = await createProposalContinueAccessToken({
        studyId: study.id,
        clientId: client.id,
        language,
        expiresInDays: 15,
      });
      await sendProposalEmail({
        to: email,
        clientName: `${nombre} ${apellidos}`.trim(),
        pdfBuffer: driveProposal.buffer,
        pdfFilename: driveProposal.fileName,
        proposalUrl,
        continueContractUrl: access.continueUrl,
        language,
      });

      const { data: updatedStudy } = await supabase
        .from("studies")
        .update({
          email_status: "sent",
        })
        .eq("id", id)
        .select()
        .single();

      return res.json({
        success: true,
        message: "Correo reenviado correctamente",
        study: updatedStudy ?? study,
        email: {
          to: email,
          status: "sent",
        },
      });
    } catch (error: any) {
      console.error("Error en /api/studies/:id/send-proposal-email:", error);

      return res.status(500).json({
        error: "No se pudo reenviar el correo",
        details: error?.message || "Error desconocido",
      });
    }
  });

  registerGeocodingRoutes(app, {
    geocodeAddressWithGoogle,
    isGeocodeError: (error): error is GeocodeError =>
      error instanceof GeocodeError,
  });

  // =========================
  // STUDIES API
  // =========================

  app.post("/api/studies/:id/auto-assign-installation", async (req, res) => {
    try {
      const { id } = req.params;

      const assignedKwp = toPositiveNumber(
        req.body.assignedKwp ??
          req.body.assigned_kwp ??
          req.body?.calculation?.assigned_kwp ??
          req.body?.calculation?.required_kwp,
      );

      if (assignedKwp === null) {
        return res.status(400).json({
          error: "assignedKwp debe ser un número mayor que 0",
        });
      }

      const result = await findEligibleInstallationsForStudy({
        studyId: id,
        assignedKwp,
        radiusMeters: 5000,
      });

      if (result.reason === "no_installations_in_range") {
        return res.status(200).json({
          success: false,
          assignable: false,
          reason: "no_installations_in_range",
          message:
            "No hay instalaciones disponibles en un radio de 2 km. Contacte con Sapiens.",
          contact: {
            phone: SAPIENS_CONTACT_PHONE,
            email: SAPIENS_CONTACT_EMAIL,
          },
        });
      }

      if (result.reason === "no_capacity_in_range") {
        return res.status(200).json({
          success: false,
          assignable: false,
          reason: "no_capacity_in_range",
          message:
            "Hay instalaciones cercanas, pero ahora mismo no tienen capacidad disponible. Contacte con Sapiens.",
          contact: {
            phone: SAPIENS_CONTACT_PHONE,
            email: SAPIENS_CONTACT_EMAIL,
          },
          nearby_installations: result.withinRange.map((item) => ({
            id: item.id,
            nombre_instalacion: item.nombre_instalacion,
            distance_meters: item.distance_meters,
            availableKwp: item.availableKwp,
            effectiveAssignedKwp: item.effectiveAssignedKwp,
            assignedKwpSource: item.assignedKwpSource,
          })),
        });
      }

      if (!result.recommended) {
        return res.status(200).json({
          success: false,
          assignable: false,
          reason: "no_capacity_in_range",
          message:
            "Hay instalaciones cercanas, pero ahora mismo no tienen capacidad disponible. Contacte con Sapiens.",
          contact: {
            phone: SAPIENS_CONTACT_PHONE,
            email: SAPIENS_CONTACT_EMAIL,
          },
        });
      }

      const recommended = result.recommended;
      const effectiveAssignedKwp = recommended.effectiveAssignedKwp;

      const nextUsedKwp = recommended.usedKwp + effectiveAssignedKwp;
      const nextAvailableKwp = Math.max(recommended.totalKwp - nextUsedKwp, 0);
      const nextOccupancyPercent =
        recommended.totalKwp > 0
          ? Number(((nextUsedKwp / recommended.totalKwp) * 100).toFixed(2))
          : 0;

      const snapshot = {
        installationId: recommended.id,
        installationName: recommended.nombre_instalacion,
        installationData: {
          id: recommended.id,
          nombre_instalacion: recommended.nombre_instalacion,
          direccion: recommended.direccion,
          lat: recommended.lat,
          lng: recommended.lng,
          potencia_instalada_kwp: recommended.totalKwp,
          active: recommended.active,
          calculo_estudios: recommended.calculo_estudios ?? null,
          potencia_fija_kwp: recommended.potencia_fija_kwp ?? null,
          reserva: recommended.reserva ?? null,
          reserva_fija_eur: recommended.reserva_fija_eur ?? null,
          iban_aportaciones: recommended.iban_aportaciones ?? null,
        },
        requested_assigned_kwp: assignedKwp,
        assigned_kwp: effectiveAssignedKwp,
        assigned_kwp_source: recommended.assignedKwpSource,
        calculation_mode: recommended.calculationMode,
        occupancy: {
          total_kwp: recommended.totalKwp,
          reserved_kwp: recommended.reservedKwp,
          confirmed_kwp: recommended.confirmedKwp,
          used_kwp: nextUsedKwp,
          available_kwp: nextAvailableKwp,
          occupancy_percent: nextOccupancyPercent,
        },
        distance_meters: recommended.distance_meters,
        updated_at: new Date().toISOString(),
      };

      const { data: updatedStudy, error: updateError } = await supabase
        .from("studies")
        .update({
          selected_installation_id: recommended.id,
          assigned_kwp: effectiveAssignedKwp,
          selected_installation_snapshot: snapshot,
        })
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        return res.status(500).json({
          error: "Error actualizando el estudio",
          details: updateError.message,
        });
      }

      return res.json({
        success: true,
        assignable: true,
        study: updatedStudy,
        installation: {
          id: recommended.id,
          nombre_instalacion: recommended.nombre_instalacion,
          distance_meters: recommended.distance_meters,
          totalKwp: recommended.totalKwp,
          usedKwp: nextUsedKwp,
          availableKwp: nextAvailableKwp,
          occupancyPercent: nextOccupancyPercent,
          requestedAssignedKwp: assignedKwp,
          effectiveAssignedKwp,
          assignedKwpSource: recommended.assignedKwpSource,
          calculationMode: recommended.calculationMode,
        },
      });
    } catch (error: any) {
      console.error(
        "Error en /api/studies/:id/auto-assign-installation:",
        error,
      );
      return res.status(500).json({
        error: "No se pudo autoasignar la instalación",
        details: error?.message || "Error desconocido",
      });
    }
  });

  // [admin-only removed] POST /api/studies, GET /api/studies, GET /api/studies/:id
  // y PUT /api/studies/:id se han eliminado de esta aplicación. La gestión de
  // estudios se realiza desde la aplicación de back-office. El flujo público
  // solo necesita POST /api/confirm-study, que crea el estudio tras la
  // confirmación del cliente.

  app.post("/api/contracts/:id/retry-payment", async (req, res) => {
    try {
      const { id } = req.params;

      const { data: contract, error: contractError } = await supabase
        .from("contracts")
        .select("*")
        .eq("id", id)
        .single();

      if (contractError || !contract) {
        return res.status(404).json({
          error: "Contrato no encontrado",
          details: contractError?.message ?? "El contrato no existe",
        });
      }

      const { data: reservation, error: reservationError } = await supabase
        .from("installation_reservations")
        .select("*")
        .eq("contract_id", contract.id)
        .maybeSingle();

      if (reservationError || !reservation) {
        return res.status(404).json({
          error: "No existe una reserva asociada a este contrato",
          details: reservationError?.message ?? "Reserva no encontrada",
        });
      }

      if (reservation.payment_status === "paid") {
        return res.status(409).json({
          error: "La reserva ya está pagada",
        });
      }

      if (reservation.reservation_status !== "pending_payment") {
        return res.status(409).json({
          error: "La reserva ya no está en estado pendiente de pago",
        });
      }

      const ctx = await getContractContextFromStudy(contract.study_id);

      const resolvedReservation = resolveReservationAmountForInstallation({
        installation: ctx.installation,
        assignedKwp: ctx.assignedKwp,
        fallbackAmount:
          reservation.signal_amount ??
          contract?.metadata?.signal_amount ??
          DEFAULT_SIGNAL_AMOUNT_EUR,
      });

      const signalAmount = resolvedReservation.signalAmount;
      const reservationMode = resolvedReservation.reservationMode;
      const reservationAmountSource = resolvedReservation.source;

      const currency = String(
        reservation.currency || contract?.metadata?.currency || "eur",
      )
        .trim()
        .toLowerCase();

      const paymentDeadlineAt =
        reservation.payment_deadline_at ??
        new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

      const checkoutSession = await createCheckoutSessionForReservation({
        reservationId: reservation.id,
        contractId: contract.id,
        studyId: ctx.study.id,
        clientId: ctx.client.id,
        installationId: ctx.installation.id,
        installationName: ctx.installation.nombre_instalacion,
        clientEmail: ctx.client.email ?? null,
        signalAmount,
        currency,
        paymentDeadlineAt,
      });

      const { error: reservationUpdateError } = await supabase
        .from("installation_reservations")
        .update({
          stripe_checkout_session_id: checkoutSession.id,
          signal_amount: signalAmount,
          currency,
          metadata: {
            ...(reservation.metadata ?? {}),
            reservation_mode: reservationMode,
            reservation_amount_source: reservationAmountSource,
          },
        })
        .eq("id", reservation.id);

      if (reservationUpdateError) {
        return res.status(500).json({
          error: "No se pudo actualizar la nueva sesión de Stripe",
          details: reservationUpdateError.message,
        });
      }

      const { error: contractUpdateError } = await supabase
        .from("contracts")
        .update({
          metadata: {
            ...(contract.metadata ?? {}),
            signal_amount: signalAmount,
            currency,
            stripe_checkout_session_id: checkoutSession.id,
            payment_step: "redirect_to_stripe",
            reservation_mode: reservationMode,
            reservation_amount_source: reservationAmountSource,
          },
        })
        .eq("id", contract.id);

      if (contractUpdateError) {
        return res.status(500).json({
          error:
            "No se pudo actualizar el contrato con la nueva sesión de Stripe",
          details: contractUpdateError.message,
        });
      }

      return res.json({
        success: true,
        reservationId: reservation.id,
        signalAmount,
        currency,
        reservationMode,
        reservationAmountSource,
        stripe: {
          checkoutSessionId: checkoutSession.id,
          checkoutUrl: checkoutSession.url,
        },
      });
    } catch (error: any) {
      console.error("Error en /api/contracts/:id/retry-payment:", error);
      return res.status(500).json({
        error: "No se pudo regenerar el pago",
        details: error?.message || "Error desconocido",
      });
    }
  });

  app.get("/api/contracts/:id/reservation-status", async (req, res) => {
    try {
      const { id } = req.params;

      const { data: contract, error: contractError } = await supabase
        .from("contracts")
        .select("id, contract_number, status")
        .eq("id", id)
        .single();

      if (contractError || !contract) {
        return res.status(404).json({
          error: "Contrato no encontrado",
          details: contractError?.message ?? "El contrato no existe",
        });
      }

      const { data: reservation, error: reservationError } = await supabase
        .from("installation_reservations")
        .select("*")
        .eq("contract_id", id)
        .maybeSingle();

      if (reservationError) {
        return res.status(500).json({
          error: "No se pudo consultar la reserva",
          details: reservationError.message,
        });
      }

      return res.json({
        success: true,
        contract,
        reservation: reservation
          ? {
              id: reservation.id,
              reservationStatus: reservation.reservation_status,
              paymentStatus: reservation.payment_status,
              paymentDeadlineAt: reservation.payment_deadline_at,
              confirmedAt: reservation.confirmed_at,
              releasedAt: reservation.released_at,
              signalAmount: reservation.signal_amount,
              currency: reservation.currency,
            }
          : null,
      });
    } catch (error: any) {
      console.error("Error en /api/contracts/:id/reservation-status:", error);
      return res.status(500).json({
        error: "No se pudo consultar el estado de la reserva",
        details: error?.message || "Error desconocido",
      });
    }
  });

  // [admin-only removed] PATCH /api/studies/:id/assign-installation se ha
  // eliminado. La asignación manual de instalaciones se realiza desde la
  // aplicación de back-office. El flujo público usa
  // POST /api/studies/:id/auto-assign-installation tras confirmar el estudio.

  //Ruta acceso contrato desde mail
  app.post("/api/contracts/proposal-access/validate", async (req, res) => {
    try {
      const token = String(req.body?.token || "").trim();
      const dni = String(req.body?.dni || "").trim();
      const nombre = String(req.body?.nombre || "").trim();
      const apellidos = String(req.body?.apellidos || "").trim();

      if (!token || !dni || !nombre || !apellidos) {
        return res.status(400).json({
          error: "Faltan token, DNI, nombre o apellidos",
        });
      }

      const tokenHash = sha256(token);

      const { data: accessToken, error: accessError } = await supabase
        .from("contract_access_tokens")
        .select("*")
        .eq("token_hash", tokenHash)
        .eq("purpose", "proposal_continue")
        .is("revoked_at", null)
        .maybeSingle();

      if (accessError) {
        console.error(
          "Error consultando contract_access_tokens en proposal-access/validate:",
          accessError,
        );

        return res.status(500).json({
          error: "No se pudo validar el acceso",
          details: accessError.message,
        });
      }

      if (!accessToken) {
        return res.status(404).json({
          error: "Enlace no válido",
        });
      }

      if (
        accessToken.expires_at &&
        new Date(accessToken.expires_at).getTime() < Date.now()
      ) {
        return res.status(410).json({
          error: "El enlace ha caducado",
        });
      }

      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("id", accessToken.client_id)
        .single();

      if (clientError || !client) {
        console.error(
          "Error obteniendo cliente en proposal-access/validate:",
          clientError,
        );

        return res.status(404).json({
          error: "No se encontró el cliente asociado al acceso",
          details: clientError?.message ?? "Cliente no encontrado",
        });
      }

      const sameDni = normalizeDni(client.dni) === normalizeDni(dni);
      const sameNombre =
        normalizeIdentityText(client.nombre) === normalizeIdentityText(nombre);
      const sameApellidos =
        normalizeIdentityText(client.apellidos) ===
        normalizeIdentityText(apellidos);

      if (!sameDni || !sameNombre || !sameApellidos) {
        return res.status(401).json({
          error: "Los datos introducidos no coinciden con la propuesta",
        });
      }

      const { data: study, error: studyError } = await supabase
        .from("studies")
        .select("*")
        .eq("id", accessToken.study_id)
        .single();

      if (studyError || !study) {
        console.error(
          "Error obteniendo estudio en proposal-access/validate:",
          studyError,
        );

        return res.status(404).json({
          error: "No se encontró el estudio asociado",
          details: studyError?.message ?? "Estudio no encontrado",
        });
      }

      if (!study.selected_installation_id) {
        return res.status(400).json({
          error: "El estudio no tiene instalación asociada",
        });
      }

      const { data: installation, error: installationError } = await supabase
        .from("installations")
        .select("*")
        .eq("id", study.selected_installation_id)
        .single();

      if (installationError || !installation) {
        console.error(
          "Error obteniendo instalación en proposal-access/validate:",
          installationError,
        );

        return res.status(404).json({
          error: "No se encontró la instalación asociada al estudio",
          details: installationError?.message ?? "Instalación no encontrada",
        });
      }

      const { data: existingContract, error: existingContractError } =
        await supabase
          .from("contracts")
          .select("*")
          .eq("study_id", study.id)
          .maybeSingle();

      if (existingContractError) {
        console.error(
          "Error consultando contrato existente en proposal-access/validate:",
          existingContractError,
        );

        return res.status(500).json({
          error: "No se pudo comprobar si ya existe un contrato",
          details: existingContractError.message,
        });
      }

      const resumeToken = signContractResumeToken({
        studyId: study.id,
        clientId: client.id,
        installationId: installation.id,
      });

      const language = normalizeAppLanguage(study.language);

      return res.json({
        success: true,
        resumeToken,
        language,
        access: {
          studyId: study.id,
          clientId: client.id,
          installationId: installation.id,
          expiresAt: accessToken.expires_at ?? null,
          usedAt: accessToken.used_at ?? null,
        },
        client: {
          id: client.id,
          nombre: client.nombre,
          apellidos: client.apellidos,
          dni: client.dni,
          email: client.email ?? null,
          telefono: client.telefono ?? null,
          cups: client.cups ?? null,
          direccion_completa: client.direccion_completa ?? null,
          propuesta_drive_url: client.propuesta_drive_url ?? null,
          factura_drive_url: client.factura_drive_url ?? null,
        },
        study: {
          id: study.id,
          language,
          status: study.status ?? null,
          email_status: study.email_status ?? null,
          assigned_kwp: study.assigned_kwp ?? null,
          calculation: study.calculation ?? null,
          selected_installation_id: study.selected_installation_id ?? null,
          selected_installation_snapshot:
            study.selected_installation_snapshot ?? null,
        },
        installation: {
          id: installation.id,
          nombre_instalacion: installation.nombre_instalacion,
          direccion: installation.direccion,
          modalidad: installation.modalidad,
          availableProposalModes: getAllowedProposalModes(
            installation.modalidad,
          ),
          defaultProposalMode:
            getAllowedProposalModes(installation.modalidad)[0] ?? "investment",
        },
        existingContract: existingContract
          ? {
              id: existingContract.id,
              status: existingContract.status,
              proposal_mode: existingContract.proposal_mode,
              contract_number: existingContract.contract_number,
            }
          : null,
      });
    } catch (error: any) {
      console.error("Error en /api/contracts/proposal-access/validate:", error);

      return res.status(500).json({
        error: "No se pudo validar el acceso a la propuesta",
        details: error?.message || "Error desconocido",
      });
    }
  });

  //Pre contract Valdiation
  app.post("/api/contracts/generate-from-access", async (req, res) => {
    try {
      const resumeToken = String(req.body?.resumeToken || "").trim();

      if (!resumeToken) {
        return res.status(400).json({
          error: "Falta resumeToken",
        });
      }

      let decoded: {
        studyId: string;
        clientId: string;
        installationId: string;
        iat: number;
        exp: number;
      };

      try {
        decoded = verifyContractResumeToken(resumeToken);
      } catch (error) {
        return res.status(401).json({
          error: "El acceso ha caducado o no es válido",
        });
      }

      const { studyId, clientId, installationId } = decoded;

      const { data: study, error: studyError } = await supabase
        .from("studies")
        .select("*")
        .eq("id", studyId)
        .single();

      if (studyError || !study) {
        return res.status(404).json({
          error: "No se encontró el estudio",
          details: studyError?.message ?? "Estudio no encontrado",
        });
      }

      const { data: client, error: clientError } = await supabase
        .from("clients")
        .select("*")
        .eq("id", clientId)
        .single();

      if (clientError || !client) {
        return res.status(404).json({
          error: "No se encontró el cliente",
          details: clientError?.message ?? "Cliente no encontrado",
        });
      }

      const { data: installation, error: installationError } = await supabase
        .from("installations")
        .select("*")
        .eq("id", installationId)
        .single();

      if (installationError || !installation) {
        return res.status(404).json({
          error: "No se encontró la instalación",
          details: installationError?.message ?? "Instalación no encontrada",
        });
      }

      const assignedKwp =
        toPositiveNumber(study.assigned_kwp) ??
        toPositiveNumber(study?.calculation?.recommendedPowerKwp) ??
        toPositiveNumber(study?.selected_installation_snapshot?.assigned_kwp);

      if (assignedKwp === null) {
        return res.status(400).json({
          error: "El estudio no tiene assigned_kwp válido",
        });
      }

      const requestedProposalMode = req.body?.proposalMode;
      const proposalMode = resolveProposalMode(
        requestedProposalMode,
        installation.modalidad,
      );

      const { data: existingContract, error: existingContractError } =
        await supabase
          .from("contracts")
          .select("*")
          .eq("study_id", studyId)
          .maybeSingle();

      if (existingContractError) {
        return res.status(500).json({
          error: "No se pudo consultar el contrato existente",
          details: existingContractError.message,
        });
      }

      let contract = existingContract;
      if (
        contract &&
        contract.status === "generated" &&
        !contract.signed_at &&
        !contract.uploaded_at &&
        contract.proposal_mode !== proposalMode
      ) {
        const {
          data: updatedExistingContract,
          error: updateExistingContractError,
        } = await supabase
          .from("contracts")
          .update({
            proposal_mode: proposalMode,
            metadata: {
              ...(contract.metadata ?? {}),
              assigned_kwp: assignedKwp,
              created_from_resume_access: true,
              proposal_mode_updated_from_access: true,
              proposal_mode_updated_at: new Date().toISOString(),
            },
          })
          .eq("id", contract.id)
          .select()
          .single();

        if (updateExistingContractError || !updatedExistingContract) {
          return res.status(500).json({
            error: "No se pudo actualizar la modalidad del contrato existente",
            details:
              updateExistingContractError?.message ?? "Error desconocido",
          });
        }

        contract = updatedExistingContract;
      }

      if (!contract) {
        const insertPayload = {
          study_id: study.id,
          client_id: client.id,
          installation_id: installation.id,
          proposal_mode: proposalMode,
          status: "generated",
          contract_number: buildContractNumber(study.id),
          signature_type: "simple",
          metadata: {
            assigned_kwp: assignedKwp,
            study_created_at: study.created_at,
            created_from_resume_access: true,
          },
        };

        const { data: createdContract, error: contractError } = await supabase
          .from("contracts")
          .insert([insertPayload])
          .select()
          .single();

        if (contractError) {
          const isDuplicateStudy =
            contractError.code === "23505" ||
            String(contractError.message || "")
              .toLowerCase()
              .includes("duplicate") ||
            String(contractError.message || "").includes(
              "contracts_study_id_unique",
            );

          if (isDuplicateStudy) {
            const { data: existingAfterDuplicate, error: refetchError } =
              await supabase
                .from("contracts")
                .select("*")
                .eq("study_id", study.id)
                .single();

            if (refetchError || !existingAfterDuplicate) {
              return res.status(500).json({
                error:
                  "Se detectó un contrato duplicado pero no se pudo recuperar",
                details: refetchError?.message ?? contractError.message,
              });
            }

            contract = existingAfterDuplicate;
          } else {
            return res.status(500).json({
              error: "No se pudo generar el contrato desde el acceso",
              details: contractError.message,
            });
          }
        } else if (!createdContract) {
          return res.status(500).json({
            error: "No se pudo generar el contrato desde el acceso",
            details: "Contrato no devuelto tras inserción",
          });
        } else {
          contract = createdContract;
        }
      }

      const { data: existingReservation, error: reservationLookupError } =
        await supabase
          .from("installation_reservations")
          .select("id, reservation_status, payment_status, payment_deadline_at")
          .eq("contract_id", contract.id)
          .maybeSingle();

      if (reservationLookupError) {
        return res.status(500).json({
          error: "No se pudo comprobar si el contrato ya tenía reserva",
          details: reservationLookupError.message,
        });
      }

      const alreadySigned =
        contract.status !== "generated" ||
        Boolean(contract.signed_at) ||
        Boolean(contract.uploaded_at) ||
        Boolean(existingReservation);

      if (alreadySigned) {
        return res.status(409).json({
          success: false,
          alreadySigned: true,
          message: "Este pre-contrato ya fue firmado anteriormente.",
          contract: {
            id: contract.id,
            status: contract.status,
            proposal_mode: contract.proposal_mode,
            contract_number: contract.contract_number,
            signed_at: contract.signed_at ?? null,
            uploaded_at: contract.uploaded_at ?? null,
            confirmed_at: contract.confirmed_at ?? null,
          },
          reservationSummary: existingReservation
            ? {
                reservationStatus:
                  existingReservation.reservation_status ?? null,
                paymentStatus: existingReservation.payment_status ?? null,
                paymentDeadlineAt:
                  existingReservation.payment_deadline_at ?? null,
              }
            : null,
        });
      }

      const language = normalizeAppLanguage(study.language);

      const previewHtml = buildBasicContractHtml({
        contractId: contract.id,
        contractNumber: contract.contract_number,
        proposalMode: contract.proposal_mode,
        client,
        study,
        installation,
        assignedKwp,
        language,
      });

      return res.json({
        success: true,
        contract,
        previewHtml,
        preview: {
          contractId: contract.id,
          contractNumber: contract.contract_number,
          proposalMode: contract.proposal_mode,
          assignedKwp,
          client: {
            id: client.id,
            nombre: client.nombre,
            apellidos: client.apellidos,
            dni: client.dni,
            email: client.email,
            telefono: client.telefono,
          },
          installation: {
            id: installation.id,
            nombre_instalacion: installation.nombre_instalacion,
            direccion: installation.direccion,
            potencia_instalada_kwp: installation.potencia_instalada_kwp ?? null,
            almacenamiento_kwh: installation.almacenamiento_kwh ?? null,
            horas_efectivas: installation.horas_efectivas ?? null,
            porcentaje_autoconsumo: installation.porcentaje_autoconsumo ?? null,
          },
        },
      });
    } catch (error: any) {
      console.error("Error en /api/contracts/generate-from-access:", error);

      return res.status(500).json({
        error: "No se pudo preparar el contrato desde el acceso",
        details: error?.message || "Error desconocido",
      });
    }
  });

  app.post("/api/contracts/generate-from-study/:studyId", async (req, res) => {
    try {
      const { studyId } = req.params;

      const ctx = await getContractContextFromStudy(studyId);
      const requestedProposalMode = req.body?.proposalMode;
      const proposalMode = resolveProposalMode(
        requestedProposalMode,
        ctx.installation.modalidad,
      );

      const { data: existingContract } = await supabase
        .from("contracts")
        .select("*")
        .eq("study_id", studyId)
        .maybeSingle();

      let contract = existingContract;
      if (
        contract &&
        contract.status === "generated" &&
        !contract.signed_at &&
        !contract.uploaded_at &&
        contract.proposal_mode !== proposalMode
      ) {
        const {
          data: updatedExistingContract,
          error: updateExistingContractError,
        } = await supabase
          .from("contracts")
          .update({
            proposal_mode: proposalMode,
            metadata: {
              ...(contract.metadata ?? {}),
              assigned_kwp: ctx.assignedKwp,
              proposal_mode_updated_from_study: true,
              proposal_mode_updated_at: new Date().toISOString(),
            },
          })
          .eq("id", contract.id)
          .select()
          .single();

        if (updateExistingContractError || !updatedExistingContract) {
          return res.status(500).json({
            error: "No se pudo actualizar la modalidad del contrato existente",
            details:
              updateExistingContractError?.message ?? "Error desconocido",
          });
        }

        contract = updatedExistingContract;
      }

      if (!contract) {
        const insertPayload = {
          study_id: ctx.study.id,
          client_id: ctx.client.id,
          installation_id: ctx.installation.id,
          proposal_mode: proposalMode,
          status: "generated",
          contract_number: buildContractNumber(ctx.study.id),
          signature_type: "simple",
          metadata: {
            assigned_kwp: ctx.assignedKwp,
            study_created_at: ctx.study.created_at,
          },
        };

        const { data: createdContract, error: contractError } = await supabase
          .from("contracts")
          .insert([insertPayload])
          .select()
          .single();

        if (contractError || !createdContract) {
          return res.status(500).json({
            error: "No se pudo generar el contrato",
            details: contractError?.message ?? "Error desconocido",
          });
        }

        contract = createdContract;
      }

      const previewHtml = buildBasicContractHtml({
        contractId: contract.id,
        contractNumber: contract.contract_number,
        proposalMode: contract.proposal_mode,
        client: ctx.client,
        study: ctx.study,
        installation: ctx.installation,
        assignedKwp: ctx.assignedKwp,
        language: ctx.language,
      });

      return res.json({
        success: true,
        contract,
        previewHtml,
        preview: {
          contractId: contract.id,
          contractNumber: contract.contract_number,
          proposalMode: contract.proposal_mode,
          assignedKwp: ctx.assignedKwp,
          client: {
            id: ctx.client.id,
            nombre: ctx.client.nombre,
            apellidos: ctx.client.apellidos,
            dni: ctx.client.dni,
            email: ctx.client.email,
            telefono: ctx.client.telefono,
          },
          installation: {
            id: ctx.installation.id,
            nombre_instalacion: ctx.installation.nombre_instalacion,
            direccion: ctx.installation.direccion,
            potencia_instalada_kwp:
              ctx.installation.potencia_instalada_kwp ?? null,
            almacenamiento_kwh: ctx.installation.almacenamiento_kwh ?? null,
            horas_efectivas: ctx.installation.horas_efectivas ?? null,
            porcentaje_autoconsumo:
              ctx.installation.porcentaje_autoconsumo ?? null,
          },
        },
      });
    } catch (error: any) {
      console.error(
        "Error en /api/contracts/generate-from-study/:studyId:",
        error,
      );

      return res.status(500).json({
        error: "No se pudo generar el contrato",
        details: error?.message || "Error desconocido",
      });
    }
  });

  app.get("/api/contracts/:id", async (req, res) => {
    try {
      const { id } = req.params;

      const { data: contract, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !contract) {
        return res.status(404).json({
          error: "Contrato no encontrado",
          details: error?.message ?? "El contrato no existe",
        });
      }

      return res.json(contract);
    } catch (error: any) {
      console.error("Error en /api/contracts/:id:", error);

      return res.status(500).json({
        error: "No se pudo obtener el contrato",
        details: error?.message || "Error desconocido",
      });
    }
  });

  app.post(
    "/api/contracts/:id/sign",
    upload.fields([
      { name: "signed_contract", maxCount: 1 },
      { name: "file", maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        const { id } = req.params;

        const files =
          (req.files as {
            [fieldname: string]: Express.Multer.File[];
          }) || {};

        const signedContractFile =
          files.signed_contract?.[0] || files.file?.[0] || null;

        if (!signedContractFile) {
          return res.status(400).json({
            error: "Debes enviar el PDF firmado del pre-contrato",
          });
        }

        const { data: contract, error: contractError } = await supabase
          .from("contracts")
          .select("*")
          .eq("id", id)
          .single();

        if (contractError || !contract) {
          return res.status(404).json({
            error: "Contrato no encontrado",
            details: contractError?.message ?? "El contrato no existe",
          });
        }

        if (contract.status !== "generated") {
          return res.status(409).json({
            alreadySigned: true,
            error: "Este pre-contrato ya fue firmado anteriormente",
            message: "Este pre-contrato ya fue firmado anteriormente",
            contract: {
              id: contract.id,
              status: contract.status,
              contract_number: contract.contract_number,
            },
          });
        }

        const { data: existingReservation, error: existingReservationError } =
          await supabase
            .from("installation_reservations")
            .select(
              "id, reservation_status, payment_status, payment_deadline_at, signal_amount, currency, stripe_checkout_session_id, metadata",
            )
            .eq("contract_id", contract.id)
            .maybeSingle();

        if (existingReservationError) {
          return res.status(500).json({
            error: "No se pudo comprobar si ya existe una reserva asociada",
            details: existingReservationError.message,
          });
        }

        if (existingReservation) {
          return res.status(409).json({
            alreadySigned: true,
            error: "Este pre-contrato ya tiene una reserva asociada",
            message: "Este pre-contrato ya fue firmado anteriormente",
            contract: {
              id: contract.id,
              status: contract.status,
              contract_number: contract.contract_number,
            },
            reservationSummary: {
              reservationId: existingReservation.id,
              reservationStatus: existingReservation.reservation_status ?? null,
              paymentStatus: existingReservation.payment_status ?? null,
              paymentDeadlineAt:
                existingReservation.payment_deadline_at ?? null,
              signalAmount: existingReservation.signal_amount ?? null,
              currency: existingReservation.currency ?? null,
              stripeCheckoutSessionId:
                existingReservation.stripe_checkout_session_id ?? null,
              reservationMode:
                (existingReservation.metadata as any)?.reservation_mode ?? null,
            },
          });
        }

        const ctx = await getContractContextFromStudy(contract.study_id);

        const contractsFolders =
          await ensureContractsStatusFolder("PendientesPago");

        const contractFileName = buildContractFileName({
          dni: ctx.client.dni,
          nombre: ctx.client.nombre,
          apellidos: ctx.client.apellidos,
          contractId: contract.id,
        });

        const uploadedContract = await uploadBufferToDrive({
          folderId: contractsFolders.folder.id,
          fileName: contractFileName,
          mimeType: signedContractFile.mimetype || "application/pdf",
          buffer: signedContractFile.buffer,
        });

        const paymentDeadlineAt = new Date(
          Date.now() + 15 * 24 * 60 * 60 * 1000,
        ).toISOString();

        const resolvedReservation = resolveReservationAmountForInstallation({
          installation: ctx.installation,
          assignedKwp: ctx.assignedKwp,
          fallbackAmount:
            req.body.signalAmount ??
            req.body.signal_amount ??
            contract?.metadata?.signal_amount ??
            DEFAULT_SIGNAL_AMOUNT_EUR,
        });

        const signalAmount = resolvedReservation.signalAmount;
        const reservationMode = resolvedReservation.reservationMode;
        const reservationAmountSource = resolvedReservation.source;
        const bankAccountIban = resolveInstallationBankIban(ctx.installation);

        const currency = String(req.body.currency || "eur")
          .trim()
          .toLowerCase();

        const { data: reservation, error: reservationError } =
          await supabase.rpc("reserve_installation_kwp", {
            p_installation_id: ctx.installation.id,
            p_study_id: ctx.study.id,
            p_client_id: ctx.client.id,
            p_contract_id: contract.id,
            p_reserved_kwp: ctx.assignedKwp,
            p_payment_deadline_at: paymentDeadlineAt,
            p_deadline_enforced: false,
            p_notes:
              "Reserva creada tras firma del pre-contrato y pendiente de selección de método de pago",
          });

        if (reservationError) {
          return res.status(400).json({
            error: "No se pudo crear la reserva de kWp",
            details: reservationError.message,
          });
        }

        const reservationId = Array.isArray(reservation)
          ? reservation[0]?.id
          : (reservation as any)?.id;

        if (!reservationId) {
          return res.status(500).json({
            error: "La reserva se creó pero no devolvió id",
          });
        }

        const { error: reservationUpdateError } = await supabase
          .from("installation_reservations")
          .update({
            signal_amount: signalAmount,
            currency,
            metadata: {
              payment_method: null,
              payment_method_selected_at: null,
              payment_options_available: ["stripe", "bank_transfer"],
              reservation_mode: reservationMode,
              reservation_amount_source: reservationAmountSource,
              installation_iban_aportaciones: bankAccountIban,
            },
          })
          .eq("id", reservationId);

        if (reservationUpdateError) {
          return res.status(500).json({
            error: "No se pudo guardar la señal y moneda en la reserva",
            details: reservationUpdateError.message,
          });
        }

        const nowIso = new Date().toISOString();

        const { data: updatedContract, error: updateContractError } =
          await supabase
            .from("contracts")
            .update({
              status: "uploaded",
              signed_at: nowIso,
              uploaded_at: nowIso,
              drive_folder_id: contractsFolders.folder.id,
              drive_folder_url: contractsFolders.folder.webViewLink,
              contract_drive_file_id: uploadedContract.id,
              contract_drive_url: uploadedContract.webViewLink,
              metadata: {
                ...(contract.metadata ?? {}),
                assigned_kwp: ctx.assignedKwp,
                reservation_created: true,
                reservation_id: reservationId,
                reservation_status: "pending_payment",
                payment_status: "pending",
                payment_deadline_at: paymentDeadlineAt,
                signal_amount: signalAmount,
                currency,
                payment_method: null,
                payment_step: "pending_method_selection",
                reservation_mode: reservationMode,
                reservation_amount_source: reservationAmountSource,
                installation_iban_aportaciones: bankAccountIban,
              },
            })
            .eq("id", contract.id)
            .select()
            .single();

        if (updateContractError) {
          return res.status(500).json({
            error: "No se pudo actualizar el contrato tras la firma",
            details: updateContractError.message,
          });
        }

        return res.status(201).json({
          success: true,
          message:
            "Pre-contrato firmado y reserva creada correctamente. Ahora el cliente debe seleccionar la forma de pago.",
          contract: updatedContract,
          reservation: {
            id: reservationId,
            reservationStatus: "pending_payment",
            paymentStatus: "pending",
            paymentDeadlineAt,
            signalAmount,
            currency,
            reservationMode,
            reservationAmountSource,
            installationName: ctx.installation.nombre_instalacion,
            reservedKwp: ctx.assignedKwp,
          },
          payment: {
            step: "select_method",
            availableMethods: [
              {
                id: "bank_transfer",
                label: "Transferencia bancaria",
              },
              {
                id: "stripe",
                label: "Tarjeta",
              },
            ],
          },
          drive: {
            contractsRootFolderUrl: contractsFolders.root.webViewLink,
            contractFolderUrl: contractsFolders.folder.webViewLink,
            contractFileUrl: uploadedContract.webViewLink,
          },
        });
      } catch (error: any) {
        console.error("Error en /api/contracts/:id/sign:", error);

        return res.status(500).json({
          error: "No se pudo firmar/subir el contrato",
          details: error?.message || "Error desconocido",
        });
      }
    },
  );

  //STRIPE PAYMENT INTENT WEBHOOK
  // app.post("/api/contracts/:id/payments/stripe", async (req, res) => {
  //   try {
  //     const { id } = req.params;

  //     const { data: contract, error: contractError } = await supabase
  //       .from("contracts")
  //       .select("*")
  //       .eq("id", id)
  //       .single();

  //     if (contractError || !contract) {
  //       return res.status(404).json({
  //         error: "Contrato no encontrado",
  //         details: contractError?.message ?? "El contrato no existe",
  //       });
  //     }

  //     const { data: reservation, error: reservationError } = await supabase
  //       .from("installation_reservations")
  //       .select("*")
  //       .eq("contract_id", contract.id)
  //       .maybeSingle();

  //     if (reservationError) {
  //       return res.status(500).json({
  //         error: "No se pudo consultar la reserva asociada",
  //         details: reservationError.message,
  //       });
  //     }

  //     if (!reservation) {
  //       return res.status(404).json({
  //         error: "No existe una reserva asociada a este contrato",
  //       });
  //     }

  //     if (reservation.payment_status === "paid") {
  //       return res.status(409).json({
  //         error: "La reserva ya está pagada",
  //       });
  //     }

  //     if (reservation.reservation_status !== "pending_payment") {
  //       return res.status(409).json({
  //         error: "La reserva ya no está pendiente de pago",
  //         reservationStatus: reservation.reservation_status ?? null,
  //         paymentStatus: reservation.payment_status ?? null,
  //       });
  //     }

  //     const ctx = await getContractContextFromStudy(contract.study_id);

  //     const signalAmount =
  //       toPositiveNumber(
  //         reservation.signal_amount ??
  //           contract?.metadata?.signal_amount ??
  //           DEFAULT_SIGNAL_AMOUNT_EUR,
  //       ) ?? null;

  //     if (signalAmount === null) {
  //       return res.status(400).json({
  //         error: "La señal debe ser un número mayor que 0",
  //       });
  //     }

  //     const currency = String(
  //       reservation.currency || contract?.metadata?.currency || "eur",
  //     )
  //       .trim()
  //       .toLowerCase();

  //     const paymentDeadlineAt =
  //       reservation.payment_deadline_at ??
  //       new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

  //     const checkoutSession = await createCheckoutSessionForReservation({
  //       reservationId: reservation.id,
  //       contractId: contract.id,
  //       studyId: ctx.study.id,
  //       clientId: ctx.client.id,
  //       installationId: ctx.installation.id,
  //       installationName: ctx.installation.nombre_instalacion,
  //       clientEmail: ctx.client.email ?? null,
  //       signalAmount,
  //       currency,
  //       paymentDeadlineAt,
  //     });

  //     const nowIso = new Date().toISOString();

  //     const { error: reservationUpdateError } = await supabase
  //       .from("installation_reservations")
  //       .update({
  //         stripe_checkout_session_id: checkoutSession.id,
  //         signal_amount: signalAmount,
  //         currency,
  //         metadata: {
  //           ...(reservation.metadata ?? {}),
  //           payment_method: "stripe",
  //           payment_method_selected_at: nowIso,
  //         },
  //       })
  //       .eq("id", reservation.id);

  //     if (reservationUpdateError) {
  //       return res.status(500).json({
  //         error: "No se pudo guardar la selección de pago con Stripe",
  //         details: reservationUpdateError.message,
  //       });
  //     }

  //     const { data: updatedContract, error: contractUpdateError } =
  //       await supabase
  //         .from("contracts")
  //         .update({
  //           metadata: {
  //             ...(contract.metadata ?? {}),
  //             signal_amount: signalAmount,
  //             currency,
  //             payment_method: "stripe",
  //             payment_method_selected_at: nowIso,
  //             payment_step: "redirect_to_stripe",
  //             stripe_checkout_session_id: checkoutSession.id,
  //           },
  //         })
  //         .eq("id", contract.id)
  //         .select()
  //         .single();

  //     if (contractUpdateError) {
  //       return res.status(500).json({
  //         error: "No se pudo actualizar el contrato tras seleccionar Stripe",
  //         details: contractUpdateError.message,
  //       });
  //     }

  //     return res.json({
  //       success: true,
  //       message:
  //         "Método de pago seleccionado correctamente. Redirigiendo a Stripe.",
  //       contract: {
  //         id: updatedContract.id,
  //         status: updatedContract.status,
  //         contractNumber: updatedContract.contract_number,
  //       },
  //       reservation: {
  //         id: reservation.id,
  //         reservationStatus:
  //           reservation.reservation_status ?? "pending_payment",
  //         paymentStatus: reservation.payment_status ?? "pending",
  //         paymentDeadlineAt,
  //         signalAmount,
  //         currency,
  //         paymentMethod: "stripe",
  //       },
  //       stripe: {
  //         checkoutSessionId: checkoutSession.id,
  //         checkoutUrl: checkoutSession.url,
  //       },
  //     });
  //   } catch (error: any) {
  //     console.error("Error en /api/contracts/:id/payments/stripe:", error);

  //     return res.status(500).json({
  //       error: "No se pudo iniciar el pago con Stripe",
  //       details: error?.message || "Error desconocido",
  //     });
  //   }
  // });

  app.post("/api/contracts/:id/payments/stripe", async (req, res) => {
    try {
      const { id } = req.params;

      const { data: contract, error: contractError } = await supabase
        .from("contracts")
        .select("*")
        .eq("id", id)
        .single();

      if (contractError || !contract) {
        return res.status(404).json({
          error: "Contrato no encontrado",
          details: contractError?.message ?? "El contrato no existe",
        });
      }

      const { data: reservation, error: reservationError } = await supabase
        .from("installation_reservations")
        .select("*")
        .eq("contract_id", contract.id)
        .maybeSingle();

      if (reservationError) {
        return res.status(500).json({
          error: "No se pudo consultar la reserva asociada",
          details: reservationError.message,
        });
      }

      if (!reservation) {
        return res.status(404).json({
          error: "No existe una reserva asociada a este contrato",
        });
      }

      if (reservation.payment_status === "paid") {
        return res.status(409).json({
          error: "La reserva ya está pagada",
        });
      }

      if (reservation.reservation_status !== "pending_payment") {
        return res.status(409).json({
          error: "La reserva ya no está pendiente de pago",
          reservationStatus: reservation.reservation_status ?? null,
          paymentStatus: reservation.payment_status ?? null,
        });
      }

      const ctx = await getContractContextFromStudy(contract.study_id);

      const resolvedReservation = resolveReservationAmountForInstallation({
        installation: ctx.installation,
        assignedKwp: ctx.assignedKwp,
        fallbackAmount:
          reservation.signal_amount ??
          contract?.metadata?.signal_amount ??
          DEFAULT_SIGNAL_AMOUNT_EUR,
      });

      const signalAmount = resolvedReservation.signalAmount;
      const reservationMode = resolvedReservation.reservationMode;
      const reservationAmountSource = resolvedReservation.source;

      const currency = String(
        reservation.currency || contract?.metadata?.currency || "eur",
      )
        .trim()
        .toLowerCase();

      const paymentDeadlineAt =
        reservation.payment_deadline_at ??
        new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

      const checkoutSession = await createCheckoutSessionForReservation({
        reservationId: reservation.id,
        contractId: contract.id,
        studyId: ctx.study.id,
        clientId: ctx.client.id,
        installationId: ctx.installation.id,
        installationName: ctx.installation.nombre_instalacion,
        clientEmail: ctx.client.email ?? null,
        signalAmount,
        currency,
        paymentDeadlineAt,
      });

      const nowIso = new Date().toISOString();

      const { error: reservationUpdateError } = await supabase
        .from("installation_reservations")
        .update({
          stripe_checkout_session_id: checkoutSession.id,
          signal_amount: signalAmount,
          currency,
          metadata: {
            ...(reservation.metadata ?? {}),
            payment_method: "stripe",
            payment_method_selected_at: nowIso,
            reservation_mode: reservationMode,
            reservation_amount_source: reservationAmountSource,
          },
        })
        .eq("id", reservation.id);

      if (reservationUpdateError) {
        return res.status(500).json({
          error: "No se pudo guardar la selección de pago con Stripe",
          details: reservationUpdateError.message,
        });
      }

      const { data: updatedContract, error: contractUpdateError } =
        await supabase
          .from("contracts")
          .update({
            metadata: {
              ...(contract.metadata ?? {}),
              signal_amount: signalAmount,
              currency,
              payment_method: "stripe",
              payment_method_selected_at: nowIso,
              payment_step: "redirect_to_stripe",
              stripe_checkout_session_id: checkoutSession.id,
              reservation_mode: reservationMode,
              reservation_amount_source: reservationAmountSource,
            },
          })
          .eq("id", contract.id)
          .select()
          .single();

      if (contractUpdateError) {
        return res.status(500).json({
          error: "No se pudo actualizar el contrato tras seleccionar Stripe",
          details: contractUpdateError.message,
        });
      }

      return res.json({
        success: true,
        message:
          "Método de pago seleccionado correctamente. Redirigiendo a Stripe.",
        contract: {
          id: updatedContract.id,
          status: updatedContract.status,
          contractNumber: updatedContract.contract_number,
        },
        reservation: {
          id: reservation.id,
          reservationStatus:
            reservation.reservation_status ?? "pending_payment",
          paymentStatus: reservation.payment_status ?? "pending",
          paymentDeadlineAt,
          signalAmount,
          currency,
          paymentMethod: "stripe",
          reservationMode,
          reservationAmountSource,
        },
        stripe: {
          checkoutSessionId: checkoutSession.id,
          checkoutUrl: checkoutSession.url,
        },
      });
    } catch (error: any) {
      console.error("Error en /api/contracts/:id/payments/stripe:", error);

      return res.status(500).json({
        error: "No se pudo iniciar el pago con Stripe",
        details: error?.message || "Error desconocido",
      });
    }
  });

  app.post("/api/contracts/:id/payments/bank-transfer", async (req, res) => {
    try {
      const { id } = req.params;

      const { data: contract, error: contractError } = await supabase
        .from("contracts")
        .select("*")
        .eq("id", id)
        .single();

      if (contractError || !contract) {
        return res.status(404).json({
          error: "Contrato no encontrado",
          details: contractError?.message ?? "El contrato no existe",
        });
      }

      const { data: reservation, error: reservationError } = await supabase
        .from("installation_reservations")
        .select("*")
        .eq("contract_id", contract.id)
        .maybeSingle();

      if (reservationError) {
        return res.status(500).json({
          error: "No se pudo consultar la reserva asociada",
          details: reservationError.message,
        });
      }

      if (!reservation) {
        return res.status(404).json({
          error: "No existe una reserva asociada a este contrato",
        });
      }

      if (reservation.payment_status === "paid") {
        return res.status(409).json({
          error: "La reserva ya está pagada",
        });
      }

      if (reservation.reservation_status !== "pending_payment") {
        return res.status(409).json({
          error: "La reserva ya no está pendiente de pago",
          reservationStatus: reservation.reservation_status ?? null,
          paymentStatus: reservation.payment_status ?? null,
        });
      }

      const ctx = await getContractContextFromStudy(contract.study_id);

      if (!ctx.client.email) {
        return res.status(400).json({
          error:
            "El cliente no tiene email para enviar las instrucciones de transferencia",
        });
      }

      if (!contract.contract_drive_file_id) {
        return res.status(400).json({
          error: "El contrato no tiene PDF firmado asociado en Drive",
        });
      }

      const resolvedReservation = resolveReservationAmountForInstallation({
        installation: ctx.installation,
        assignedKwp: ctx.assignedKwp,
        fallbackAmount:
          reservation.signal_amount ??
          contract?.metadata?.signal_amount ??
          DEFAULT_SIGNAL_AMOUNT_EUR,
      });

      const signalAmount = resolvedReservation.signalAmount;
      const reservationMode = resolvedReservation.reservationMode;
      const reservationAmountSource = resolvedReservation.source;
      const bankAccountIban = resolveInstallationBankIban(ctx.installation);

      const currency = String(
        reservation.currency || contract?.metadata?.currency || "eur",
      )
        .trim()
        .toLowerCase();

      const paymentDeadlineAt =
        reservation.payment_deadline_at ??
        new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

      const precontractFile = await downloadDriveFileAsBuffer(
        contract.contract_drive_file_id,
      );

      const transferConcept = `Reserva ${contract.contract_number}`;
      const nowIso = new Date().toISOString();

      await sendBankTransferReservationEmail({
        to: ctx.client.email,
        clientName: `${ctx.client.nombre} ${ctx.client.apellidos}`.trim(),
        precontractPdfBuffer: precontractFile.buffer,
        precontractPdfFilename:
          precontractFile.fileName ||
          `PRECONTRATO_${contract.contract_number}.pdf`,
        contractNumber: contract.contract_number,
        installationName: ctx.installation.nombre_instalacion,
        reservedKwp: Number(reservation.reserved_kwp ?? ctx.assignedKwp ?? 0),
        signalAmount,
        currency,
        paymentDeadlineAt,
        bankAccountIban,
        bankBeneficiary: "Sapiens Energía",
        transferConcept,
        language: ctx.language,
      });

      const { error: reservationUpdateError } = await supabase
        .from("installation_reservations")
        .update({
          signal_amount: signalAmount,
          currency,
          metadata: {
            ...(reservation.metadata ?? {}),
            payment_method: "bank_transfer",
            payment_method_selected_at: nowIso,
            bank_transfer_email_sent_at: nowIso,
            bank_account_iban: bankAccountIban,
            transfer_concept: transferConcept,
            reservation_mode: reservationMode,
            reservation_amount_source: reservationAmountSource,
          },
        })
        .eq("id", reservation.id);

      if (reservationUpdateError) {
        return res.status(500).json({
          error:
            "No se pudo actualizar la reserva tras seleccionar transferencia",
          details: reservationUpdateError.message,
        });
      }

      const { data: updatedContract, error: contractUpdateError } =
        await supabase
          .from("contracts")
          .update({
            metadata: {
              ...(contract.metadata ?? {}),
              signal_amount: signalAmount,
              currency,
              payment_method: "bank_transfer",
              payment_method_selected_at: nowIso,
              payment_step: "awaiting_bank_transfer",
              bank_transfer_email_sent_at: nowIso,
              bank_account_iban: bankAccountIban,
              transfer_concept: transferConcept,
              reservation_mode: reservationMode,
              reservation_amount_source: reservationAmountSource,
            },
          })
          .eq("id", contract.id)
          .select()
          .single();

      if (contractUpdateError) {
        return res.status(500).json({
          error:
            "No se pudo actualizar el contrato tras seleccionar transferencia",
          details: contractUpdateError.message,
        });
      }

      return res.json({
        success: true,
        message:
          "Método de pago seleccionado correctamente. Se ha enviado un email con las instrucciones de transferencia bancaria.",
        contract: {
          id: updatedContract.id,
          status: updatedContract.status,
          contractNumber: updatedContract.contract_number,
        },
        reservation: {
          id: reservation.id,
          reservationStatus:
            reservation.reservation_status ?? "pending_payment",
          paymentStatus: reservation.payment_status ?? "pending",
          paymentDeadlineAt,
          signalAmount,
          currency,
          paymentMethod: "bank_transfer",
          reservationMode,
          reservationAmountSource,
        },
        bankTransfer: {
          iban: bankAccountIban,
          beneficiary: "Sapiens Energía",
          concept: transferConcept,
          paymentDeadlineAt,
          emailSentTo: ctx.client.email,
        },
      });
    } catch (error: any) {
      console.error(
        "Error en /api/contracts/:id/payments/bank-transfer:",
        error,
      );

      return res.status(500).json({
        error: "No se pudo seleccionar el pago por transferencia bancaria",
        details: error?.message || "Error desconocido",
      });
    }
  });

  registerInstallationsRoutes(app);

  await registerSpaRoutes(app);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}











