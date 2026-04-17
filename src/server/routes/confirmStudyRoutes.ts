import type { Express } from "express";
import type multer from "multer";

import { supabase } from "../clients/supabaseClient";
import { SAPIENS_CONTACT_EMAIL, SAPIENS_CONTACT_PHONE } from "../config/env";
import { sendProposalEmail } from "../../services/mailer.service";
import { createProposalContinueAccessToken } from "../services/contractAccessService";
import { normalizeAppLanguage } from "../services/contractLocalizationService";
import {
  ensureClientDriveFolder,
  uploadBufferToDrive,
} from "../services/driveStorageService";
import { geocodeAddressWithGoogle } from "../services/geocodingService";
import {
  buildInstallationSnapshot,
  getInstallationCapacityState,
  resolveAssignedKwpForInstallation,
} from "../services/installationAssignmentService";
import { getPeriodPrice } from "../utils/invoicePricingUtils";
import {
  parseMaybeJson,
  toBoolean,
  toNullableNumber,
} from "../utils/parsingUtils";
import { normalizeDriveToken, pickFirstString } from "../utils/stringUtils";

export function registerConfirmStudyRoutes(app: Express, upload: multer.Multer) {
  app.post(
    "/api/confirm-study",
    upload.fields([
      { name: "invoice", maxCount: 1 },
      { name: "proposal", maxCount: 1 },
      { name: "file", maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        const files =
          (req.files as {
            [fieldname: string]: Express.Multer.File[];
          }) || {};

        const invoiceFile = files.invoice?.[0] || files.file?.[0] || null;
        const proposalFile = files.proposal?.[0] || null;

        const customer = parseMaybeJson<any>(req.body.customer) ?? {};
        const location = parseMaybeJson<any>(req.body.location);
        const invoiceData = parseMaybeJson<any>(req.body.invoice_data) ?? {};
        const calculation = parseMaybeJson<any>(req.body.calculation);
        const selectedInstallationSnapshot = parseMaybeJson<any>(
          req.body.selected_installation_snapshot,
        );
        const sourceFile = parseMaybeJson<any>(req.body.source_file);

        const rawAddress =
          pickFirstString(
            req.body.direccion_completa,
            customer?.direccion_completa,
            customer?.address,
            invoiceData?.direccion_completa,
            invoiceData?.address,
            location?.address,
          ) ?? "";

        // Si el frontend ya geocodificó la dirección en el paso anterior
        // (/api/geocode-address), acepta las coords tal cual para no volver a
        // llamar a Google. Si no las manda, geocodifica ahora como fallback.
        const preGeocodedLat = Number(
          req.body.client_lat ??
            req.body.clientLat ??
            location?.lat ??
            customer?.lat,
        );
        const preGeocodedLng = Number(
          req.body.client_lng ??
            req.body.clientLng ??
            location?.lng ??
            customer?.lng,
        );
        const hasValidPreGeocode =
          Number.isFinite(preGeocodedLat) && Number.isFinite(preGeocodedLng);

        const geocoded = hasValidPreGeocode
          ? {
              lat: preGeocodedLat,
              lng: preGeocodedLng,
              formattedAddress:
                pickFirstString(
                  req.body.formatted_address,
                  location?.formatted_address,
                ) ??
                rawAddress ??
                null,
              placeId:
                pickFirstString(req.body.place_id, location?.place_id) ?? null,
            }
          : rawAddress
            ? await geocodeAddressWithGoogle(rawAddress).catch((err) => {
                // No queremos que confirm-study falle si el geocoding da error:
                // el estudio puede guardarse sin coords y recalcularse luego.
                console.warn(
                  `[confirm-study] Geocoding fallback falló, se guarda sin coords:`,
                  err?.message || err,
                );
                return null;
              })
            : null;

        const nombre =
          pickFirstString(
            req.body.nombre,
            customer?.nombre,
            customer?.name,
            customer?.firstName,
          ) ?? "";

        const apellidos =
          pickFirstString(
            req.body.apellidos,
            customer?.apellidos,
            customer?.lastName,
            customer?.surnames,
          ) ?? "";

        const dni =
          pickFirstString(
            req.body.dni,
            customer?.dni,
            customer?.documentNumber,
            invoiceData?.dni,
            invoiceData?.nif,
          ) ?? "";

        const cups = pickFirstString(
          req.body.cups,
          customer?.cups,
          invoiceData?.cups,
        );

        const direccionCompleta = pickFirstString(
          req.body.direccion_completa,
          customer?.direccion_completa,
          customer?.address,
          invoiceData?.direccion_completa,
          invoiceData?.address,
          location?.address,
        );

        const iban = pickFirstString(
          req.body.iban,
          customer?.iban,
          invoiceData?.iban,
        );

        const email =
          pickFirstString(
            req.body.email,
            customer?.email,
            customer?.correo,
            customer?.mail,
            invoiceData?.email,
            invoiceData?.correo,
          ) ?? null;

        const telefono =
          pickFirstString(
            req.body.telefono,
            req.body.phone,
            customer?.telefono,
            customer?.phone,
            customer?.mobile,
            customer?.movil,
            invoiceData?.telefono,
            invoiceData?.phone,
          ) ?? null;

        const codigo_postal =
          pickFirstString(
            req.body.codigo_postal,
            req.body.codigoPostal,
            req.body.postal_code,
            customer?.codigo_postal,
            customer?.codigoPostal,
            customer?.postalCode,
            invoiceData?.codigo_postal,
            invoiceData?.codigoPostal,
            invoiceData?.postalCode,
            location?.codigo_postal,
            location?.codigoPostal,
            location?.postalCode,
          ) ?? null;

        const poblacion =
          pickFirstString(
            req.body.poblacion,
            req.body.ciudad,
            req.body.localidad,
            req.body.city,
            customer?.poblacion,
            customer?.ciudad,
            customer?.localidad,
            customer?.city,
            invoiceData?.poblacion,
            invoiceData?.ciudad,
            invoiceData?.localidad,
            invoiceData?.city,
            location?.poblacion,
            location?.ciudad,
            location?.localidad,
            location?.city,
          ) ?? null;

        const provincia =
          pickFirstString(
            req.body.provincia,
            req.body.state,
            customer?.provincia,
            customer?.state,
            invoiceData?.provincia,
            invoiceData?.state,
            location?.provincia,
            location?.state,
          ) ?? null;

        const pais =
          pickFirstString(
            req.body.pais,
            req.body.country,
            customer?.pais,
            customer?.country,
            invoiceData?.pais,
            invoiceData?.country,
            location?.pais,
            location?.country,
          ) ?? "España";

        const tipoFacturaRaw = (
          pickFirstString(
            req.body.tipo_factura,
            customer?.tipo_factura,
            invoiceData?.tipo_factura,
            invoiceData?.billType,
            invoiceData?.tariffType,
          ) || "2TD"
        ).toUpperCase();

        const locationPayload = {
          ...(location ?? {}),
          address: rawAddress || location?.address || null,
          direccion_completa:
            (direccionCompleta ?? rawAddress) || location?.address || null,
          codigo_postal,
          poblacion,
          provincia,
          pais,
          lat: geocoded?.lat ?? location?.lat ?? null,
          lng: geocoded?.lng ?? location?.lng ?? null,
          formatted_address: geocoded?.formattedAddress ?? null,
          place_id: geocoded?.placeId ?? null,
        };

        const tipo_factura = tipoFacturaRaw === "3TD" ? "3TD" : "2TD";

        if (!nombre || !apellidos || !dni) {
          return res.status(400).json({
            error: "Faltan nombre, apellidos o DNI para confirmar el estudio",
          });
        }

        const consumo_mensual_real_kwh =
          toNullableNumber(req.body.consumo_mensual_real_kwh) ??
          toNullableNumber(customer?.consumo_mensual_real_kwh) ??
          toNullableNumber(invoiceData?.consumo_mensual_real_kwh) ??
          toNullableNumber(invoiceData?.monthly_real_consumption_kwh) ??
          null;

        const consumo_medio_mensual_kwh =
          toNullableNumber(req.body.consumo_medio_mensual_kwh) ??
          toNullableNumber(customer?.consumo_medio_mensual_kwh) ??
          toNullableNumber(invoiceData?.consumo_medio_mensual_kwh) ??
          toNullableNumber(invoiceData?.monthly_average_consumption_kwh) ??
          null;

        const precio_p1_eur_kwh = getPeriodPrice(req.body, invoiceData, "p1");
        const precio_p2_eur_kwh = getPeriodPrice(req.body, invoiceData, "p2");
        const precio_p3_eur_kwh = getPeriodPrice(req.body, invoiceData, "p3");
        const precio_p4_eur_kwh = getPeriodPrice(req.body, invoiceData, "p4");
        const precio_p5_eur_kwh = getPeriodPrice(req.body, invoiceData, "p5");
        const precio_p6_eur_kwh = getPeriodPrice(req.body, invoiceData, "p6");

        // Google Drive: best-effort. Si Drive falla (credenciales stubs, cuota
        // agotada, servicio caído), el estudio se guarda igualmente en Supabase
        // sin links de Drive. Los archivos se podrán subir más tarde desde el
        // back-office si es necesario.
        let folder: { id: string; webViewLink: string } | null = null;

        let uploadedInvoice: {
          id: string;
          name: string;
          webViewLink: string;
          webContentLink: string | null;
        } | null = null;

        let uploadedProposal: {
          id: string;
          name: string;
          webViewLink: string;
          webContentLink: string | null;
        } | null = null;

        let driveWarnings: string[] = [];

        try {
          folder = await ensureClientDriveFolder({
            dni,
            nombre,
            apellidos,
          });

          if (invoiceFile && folder) {
            const extension =
              invoiceFile.originalname.split(".").pop()?.toLowerCase() || "pdf";

            uploadedInvoice = await uploadBufferToDrive({
              folderId: folder.id,
              fileName: `FACTURA_${normalizeDriveToken(dni)}.${extension}`,
              mimeType: invoiceFile.mimetype,
              buffer: invoiceFile.buffer,
            });
          }

          if (proposalFile && folder) {
            uploadedProposal = await uploadBufferToDrive({
              folderId: folder.id,
              fileName: `PROPUESTA_${normalizeDriveToken(dni)}.pdf`,
              mimeType: proposalFile.mimetype || "application/pdf",
              buffer: proposalFile.buffer,
            });
          }
        } catch (driveError: any) {
          console.error(
            "[confirm-study] Google Drive falló (se continúa sin Drive):",
            driveError?.message || driveError,
          );
          driveWarnings.push(
            `Google Drive no disponible: ${driveError?.message || "error desconocido"}. El estudio se ha guardado sin archivos en Drive.`,
          );
        }

        const normalizedCustomer = {
          ...(customer ?? {}),
          nombre,
          apellidos,
          dni,
          email,
          telefono,
          cups: cups ?? null,
          direccion_completa: direccionCompleta ?? null,
          codigo_postal,
          poblacion,
          provincia,
          pais,
          iban: iban ?? null,
        };

        const clientPayload = {
          nombre,
          apellidos,
          dni,
          email,
          telefono,
          cups: cups ?? null,
          direccion_completa: direccionCompleta ?? null,
          codigo_postal,
          poblacion,
          provincia,
          pais,
          iban: iban ?? null,
          consumo_mensual_real_kwh,
          consumo_medio_mensual_kwh,
          precio_p1_eur_kwh,
          precio_p2_eur_kwh,
          precio_p3_eur_kwh,
          precio_p4_eur_kwh,
          precio_p5_eur_kwh,
          precio_p6_eur_kwh,
          tipo_factura,
          drive_folder_id: folder?.id ?? null,
          drive_folder_url: folder?.webViewLink ?? null,
          factura_drive_file_id: uploadedInvoice?.id ?? null,
          factura_drive_url: uploadedInvoice?.webViewLink ?? null,
          propuesta_drive_file_id: uploadedProposal?.id ?? null,
          propuesta_drive_url: uploadedProposal?.webViewLink ?? null,
          datos_adicionales: normalizedCustomer,
        };

        const { data: clientData, error: clientError } = await supabase
          .from("clients")
          .upsert(clientPayload, { onConflict: "dni" })
          .select()
          .single();

        if (clientError) {
          console.error("Error guardando cliente:", clientError);
          return res.status(500).json({
            error: "Error saving client",
            details: clientError.message,
          });
        }

        const selectedInstallationId =
          pickFirstString(
            req.body.selected_installation_id,
            req.body.selectedInstallationId,
            selectedInstallationSnapshot?.installationId,
            selectedInstallationSnapshot?.installationData?.id,
          ) ?? null;

        const requestedAssignedKwpRaw =
          toNullableNumber(
            req.body.assignedKwp ??
              req.body.assigned_kwp ??
              calculation?.assigned_kwp ??
              calculation?.required_kwp ??
              calculation?.recommendedPowerKwp ??
              selectedInstallationSnapshot?.requested_assigned_kwp ??
              selectedInstallationSnapshot?.assigned_kwp,
          ) ?? null;

        let finalAssignedKwp: number | null =
          requestedAssignedKwpRaw !== null && requestedAssignedKwpRaw > 0
            ? requestedAssignedKwpRaw
            : null;

        let finalSelectedInstallationSnapshot =
          selectedInstallationSnapshot ?? null;

        if (selectedInstallationId) {
          const capacityState = await getInstallationCapacityState({
            installationId: selectedInstallationId,
          });

          const requestedKwpForResolution =
            requestedAssignedKwpRaw !== null && requestedAssignedKwpRaw > 0
              ? requestedAssignedKwpRaw
              : 0;

          const resolvedAssignment = resolveAssignedKwpForInstallation({
            installation: capacityState.installation,
            requestedKwp: requestedKwpForResolution,
          });

          const effectiveAssignedKwp = resolvedAssignment.assignedKwp;

          if (!(effectiveAssignedKwp > 0)) {
            return res.status(400).json({
              error:
                "No se pudo determinar una potencia asignada válida para la instalación seleccionada",
            });
          }

          if (effectiveAssignedKwp > capacityState.availableKwp) {
            return res.status(400).json({
              error:
                "No hay capacidad suficiente en la instalación seleccionada",
              details: `Disponibles: ${capacityState.availableKwp.toFixed(
                2,
              )} kWp. Requeridos: ${effectiveAssignedKwp.toFixed(2)} kWp`,
            });
          }

          const nextUsedKwp = capacityState.usedKwp + effectiveAssignedKwp;
          const nextAvailableKwp = Math.max(
            capacityState.totalKwp - nextUsedKwp,
            0,
          );
          const nextOccupancyPercent =
            capacityState.totalKwp > 0
              ? Number(
                  ((nextUsedKwp / capacityState.totalKwp) * 100).toFixed(2),
                )
              : 0;

          finalAssignedKwp = effectiveAssignedKwp;

          finalSelectedInstallationSnapshot = {
            installationId: capacityState.installation.id,
            installationName: capacityState.installation.nombre_instalacion,
            installationData: {
              id: capacityState.installation.id,
              nombre_instalacion: capacityState.installation.nombre_instalacion,
              direccion: capacityState.installation.direccion ?? null,
              lat: capacityState.installation.lat ?? null,
              lng: capacityState.installation.lng ?? null,
              potencia_instalada_kwp: capacityState.totalKwp,
              active: capacityState.installation.active,
              calculo_estudios:
                capacityState.installation.calculo_estudios ?? null,
              potencia_fija_kwp:
                capacityState.installation.potencia_fija_kwp ?? null,
              reserva: capacityState.installation.reserva ?? null,
              reserva_fija_eur:
                capacityState.installation.reserva_fija_eur ?? null,
              iban_aportaciones:
                capacityState.installation.iban_aportaciones ?? null,
            },
            requested_assigned_kwp:
              requestedAssignedKwpRaw !== null && requestedAssignedKwpRaw > 0
                ? requestedAssignedKwpRaw
                : null,
            assigned_kwp: effectiveAssignedKwp,
            assigned_kwp_source: resolvedAssignment.source,
            calculation_mode: resolvedAssignment.calculationMode,
            occupancy: {
              total_kwp: capacityState.totalKwp,
              reserved_kwp: capacityState.reservedKwp,
              confirmed_kwp: capacityState.confirmedKwp,
              used_kwp: nextUsedKwp,
              available_kwp: nextAvailableKwp,
              occupancy_percent: nextOccupancyPercent,
            },
            updated_at: new Date().toISOString(),
          };
        }

        const appLanguage = normalizeAppLanguage(req.body.language);

        const studyInsert = {
          language: appLanguage,
          consent_accepted: toBoolean(req.body.consent_accepted),
          source_file: {
            ...(sourceFile ?? {}),
            original_name: invoiceFile?.originalname ?? null,
            mime_type: invoiceFile?.mimetype ?? null,
            drive_folder_id: folder?.id ?? null,
            drive_folder_url: folder?.webViewLink ?? null,
            invoice_drive_file_id: uploadedInvoice?.id ?? null,
            invoice_drive_url: uploadedInvoice?.webViewLink ?? null,
            proposal_drive_file_id: uploadedProposal?.id ?? null,
            proposal_drive_url: uploadedProposal?.webViewLink ?? null,
          },
          customer: normalizedCustomer,
          location: locationPayload,
          invoice_data: invoiceData ?? null,
          selected_installation_id: selectedInstallationId,
          assigned_kwp: finalAssignedKwp,
          selected_installation_snapshot: finalSelectedInstallationSnapshot,
          calculation: calculation ?? null,
          status: req.body.status ?? "uploaded",
          email_status: "pending",
        };

        const { data: studyData, error: studyError } = await supabase
          .from("studies")
          .insert([studyInsert])
          .select()
          .single();

        if (studyError) {
          console.error("Error creando estudio confirmado:", studyError);
          return res.status(500).json({
            error: "Error saving confirmed study",
            details: studyError.message,
          });
        }

        let continueContractUrl: string | null = null;
        let continueContractTokenExpiresAt: string | null = null;

        try {
          const access = await createProposalContinueAccessToken({
            studyId: studyData.id,
            clientId: clientData.id,
            language: appLanguage,
            expiresInDays: 15,
          });

          continueContractUrl = access.continueUrl;
          continueContractTokenExpiresAt = access.expiresAt;
        } catch (tokenError: any) {
          console.error(
            "Error generando token de acceso para continuar contratación:",
            tokenError,
          );
        }

        // El enum email_status en Supabase solo acepta "pending" y "sent".
        // Si el envío falla, mantenemos "pending" en la DB y reportamos el
        // error en la respuesta JSON para que el front pueda mostrar un aviso.
        let emailStatus: "pending" | "sent" = "pending";
        let emailError: string | null = null;

        if (!email) {
          emailError = "No se encontró email del cliente";
        } else if (!proposalFile) {
          emailError = "No se recibió el PDF de la propuesta";
        } else if (!continueContractUrl) {
          emailError =
            "No se pudo generar el enlace seguro para continuar la contratación";
        } else {
          try {
            await sendProposalEmail({
              to: email,
              clientName: `${nombre} ${apellidos}`.trim(),
              pdfBuffer: proposalFile.buffer,
              pdfFilename:
                proposalFile.originalname ||
                `PROPUESTA_${normalizeDriveToken(dni)}.pdf`,
              proposalUrl: uploadedProposal?.webViewLink ?? null,
              continueContractUrl,
              language: appLanguage,
            });

            emailStatus = "sent";
          } catch (error: any) {
            console.error(
              "[confirm-study] Error enviando email de propuesta:",
              error?.message || error,
            );
            emailError =
              error?.message || "Error desconocido al enviar el correo";
          }
        }

        // Solo actualizamos email_status si cambió a "sent".
        // Si sigue en "pending" no hace falta (ya se insertó así).
        let updatedStudy = studyData;

        if (emailStatus === "sent") {
          const { data: updated, error: updateStudyError } = await supabase
            .from("studies")
            .update({ email_status: "sent" })
            .eq("id", studyData.id)
            .select()
            .single();

          if (updateStudyError) {
            console.error(
              "[confirm-study] Error actualizando email_status:",
              updateStudyError,
            );
          } else if (updated) {
            updatedStudy = updated;
          }
        }

        return res.status(201).json({
          success: true,
          client: clientData,
          study: updatedStudy,
          drive: {
            folderId: folder?.id ?? null,
            folderUrl: folder?.webViewLink ?? null,
            invoiceUrl: uploadedInvoice?.webViewLink ?? null,
            proposalUrl: uploadedProposal?.webViewLink ?? null,
          },
          email: {
            to: email,
            // Exponemos "sent", "pending" o "failed" al front para que muestre
            // el mensaje adecuado (el valor "failed" solo vive en el JSON de
            // respuesta, no en el enum de la DB).
            status: emailError ? "failed" : emailStatus,
            error: emailError,
            continueContractUrl,
            continueContractTokenExpiresAt,
          },
          warnings: driveWarnings.length > 0 ? driveWarnings : undefined,
        });
      } catch (error: any) {
        console.error("Error en /api/confirm-study:", error);
        return res.status(500).json({
          error: "No se pudo confirmar el estudio",
          details: error?.message || "Error desconocido",
        });
      }
    },
  );

  //obtener clave google api
}
