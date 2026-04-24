import type { ServerDependencies } from "../ports/serverDependencies";

import { normalizeAppLanguage } from "../../domain/contracts/contractLocalization";
import {
  buildAutoAssignmentSnapshot,
  findEligibleInstallationsForStudy,
  getInstallationCapacityState,
} from "../services/installationApplicationService";
import { createProposalContinueAccessToken } from "../services/contractContextService";
import {
  buildInstallationSnapshot,
  resolveAssignedKwpForInstallation,
} from "../../domain/installations/installationPolicy";
import {
  badRequest,
  notFound,
} from "../../shared/http/httpError";
import { getPeriodPrice } from "../../utils/invoicePricingUtils";
import {
  parseMaybeJson,
  toBoolean,
  toNullableNumber,
} from "../../utils/parsingUtils";
import { normalizeDriveToken, pickFirstString } from "../../utils/stringUtils";

export async function sendStudyProposalEmailUseCase(
  deps: ServerDependencies,
  params: {
    email?: string | null;
    studyId: string;
  },
) {
  const study = await deps.repositories.studies.findById(params.studyId);

  if (!study) {
    throw notFound("Study not found", "El estudio no existe");
  }

  const customer = study.customer ?? {};
  const sourceFile = study.source_file ?? {};

  const email =
    pickFirstString(
      params.email,
      customer?.email,
      customer?.correo,
      customer?.mail,
    ) ?? null;

  const nombre =
    pickFirstString(customer?.nombre, customer?.name, "Cliente") ?? "Cliente";

  const apellidos =
    pickFirstString(customer?.apellidos, customer?.lastName, customer?.surnames) ??
    "";

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
    throw badRequest("No se encontró el email del cliente");
  }

  if (!proposalDriveFileId) {
    throw badRequest("No se encontró el PDF de propuesta en Drive");
  }

  const driveProposal = await deps.services.drive.downloadFileAsBuffer(
    proposalDriveFileId,
  );

  const clientDni =
    pickFirstString(customer?.dni, customer?.documentNumber) ?? null;

  if (!clientDni) {
    throw badRequest("No se encontró el DNI del cliente en el estudio");
  }

  const client = await deps.repositories.clients.findByDni(clientDni);

  if (!client) {
    throw notFound("No se encontró el cliente asociado al estudio", "Cliente no encontrado");
  }

  const language = normalizeAppLanguage(study.language);
  const access = await createProposalContinueAccessToken(deps, {
    clientId: client.id,
    language,
    studyId: study.id,
  });

  await deps.services.mail.sendProposalEmail({
    clientName: `${nombre} ${apellidos}`.trim(),
    continueContractUrl: access.continueUrl,
    language,
    pdfBuffer: driveProposal.buffer,
    pdfFilename: driveProposal.fileName,
    proposalUrl,
    to: email,
  });

  const updatedStudy = await deps.repositories.studies.update(params.studyId, {
    email_status: "sent",
  });

  return {
    email: {
      status: "sent",
      to: email,
    },
    message: "Correo reenviado correctamente",
    study: updatedStudy ?? study,
    success: true,
  };
}

export async function autoAssignInstallationUseCase(
  deps: ServerDependencies,
  params: {
    assignedKwp: number | null;
    studyId: string;
  },
) {
  if (params.assignedKwp === null || !(params.assignedKwp > 0)) {
    throw badRequest("assignedKwp debe ser un número mayor que 0");
  }

  const result: any = await findEligibleInstallationsForStudy(deps, {
    assignedKwp: params.assignedKwp,
    radiusMeters: deps.env.installationSearchRadiusMeters,
    studyId: params.studyId,
  });

  if (result.reason === "no_installations_in_range") {
    return {
      assignable: false,
      contact: {
        email: deps.env.sapiensContactEmail,
        phone: deps.env.sapiensContactPhone,
      },
      message:
        "No hay instalaciones disponibles en un radio de 2 km. Contacte con Sapiens.",
      reason: "no_installations_in_range",
      success: false,
    };
  }

  if (result.reason === "no_capacity_in_range" || !result.recommended) {
    return {
      assignable: false,
      contact: {
        email: deps.env.sapiensContactEmail,
        phone: deps.env.sapiensContactPhone,
      },
      message:
        "Hay instalaciones cercanas, pero ahora mismo no tienen capacidad disponible. Contacte con Sapiens.",
      nearby_installations: result.withinRange.map((item) => ({
        assignedKwpSource: item.assignedKwpSource,
        availableKwp: item.availableKwp,
        distance_meters: item.distance_meters,
        effectiveAssignedKwp: item.effectiveAssignedKwp,
        id: item.id,
        nombre_instalacion: item.nombre_instalacion,
      })),
      reason: "no_capacity_in_range",
      success: false,
    };
  }

  const recommended = result.recommended!;
  const nextUsedKwp = recommended.usedKwp + recommended.effectiveAssignedKwp;
  const nextAvailableKwp = Math.max(recommended.totalKwp - nextUsedKwp, 0);
  const nextOccupancyPercent =
    recommended.totalKwp > 0
      ? Number(((nextUsedKwp / recommended.totalKwp) * 100).toFixed(2))
      : 0;

  const snapshot = buildAutoAssignmentSnapshot({
    installation: recommended,
    requestedAssignedKwp: params.assignedKwp,
  });

  const updatedStudy = await deps.repositories.studies.update(params.studyId, {
    assigned_kwp: recommended.effectiveAssignedKwp,
    selected_installation_id: recommended.id,
    selected_installation_snapshot: snapshot,
  });

  return {
    assignable: true,
    installation: {
      assignedKwpSource: recommended.assignedKwpSource,
      availableKwp: nextAvailableKwp,
      calculationMode: recommended.calculationMode,
      distance_meters: recommended.distance_meters,
      effectiveAssignedKwp: recommended.effectiveAssignedKwp,
      id: recommended.id,
      nombre_instalacion: recommended.nombre_instalacion,
      occupancyPercent: nextOccupancyPercent,
      requestedAssignedKwp: params.assignedKwp,
      totalKwp: recommended.totalKwp,
      usedKwp: nextUsedKwp,
    },
    study: updatedStudy,
    success: true,
  };
}

export async function confirmStudyUseCase(
  deps: ServerDependencies,
  params: {
    body: Record<string, any>;
    files: {
      invoiceFile: Express.Multer.File | null;
      proposalFile: Express.Multer.File | null;
    };
  },
) {
  const { body } = params;
  const { invoiceFile, proposalFile } = params.files;

  const customer = parseMaybeJson<any>(body.customer) ?? {};
  const location = parseMaybeJson<any>(body.location);
  const invoiceData = parseMaybeJson<any>(body.invoice_data) ?? {};
  const calculation = parseMaybeJson<any>(body.calculation);
  const selectedInstallationSnapshot = parseMaybeJson<any>(
    body.selected_installation_snapshot,
  );
  const sourceFile = parseMaybeJson<any>(body.source_file);

  const rawAddress =
    pickFirstString(
      body.direccion_completa,
      customer?.direccion_completa,
      customer?.address,
      invoiceData?.direccion_completa,
      invoiceData?.address,
      location?.address,
    ) ?? "";

  const preGeocodedLat = Number(
    body.client_lat ?? body.clientLat ?? location?.lat ?? customer?.lat,
  );
  const preGeocodedLng = Number(
    body.client_lng ?? body.clientLng ?? location?.lng ?? customer?.lng,
  );
  const hasValidPreGeocode =
    Number.isFinite(preGeocodedLat) && Number.isFinite(preGeocodedLng);

  const geocoded = hasValidPreGeocode
    ? {
        formattedAddress:
          pickFirstString(body.formatted_address, location?.formatted_address) ??
          rawAddress ??
          null,
        lat: preGeocodedLat,
        lng: preGeocodedLng,
        placeId: pickFirstString(body.place_id, location?.place_id) ?? null,
      }
    : rawAddress
      ? await deps.services.geocoding.geocodeAddress(rawAddress).catch(() => null)
      : null;

  const nombre =
    pickFirstString(
      body.nombre,
      customer?.nombre,
      customer?.name,
      customer?.firstName,
    ) ?? "";

  const apellidos =
    pickFirstString(
      body.apellidos,
      customer?.apellidos,
      customer?.lastName,
      customer?.surnames,
    ) ?? "";

  const dni =
    pickFirstString(
      body.dni,
      customer?.dni,
      customer?.documentNumber,
      invoiceData?.dni,
      invoiceData?.nif,
    ) ?? "";

  if (!nombre || !apellidos || !dni) {
    throw badRequest("Faltan nombre, apellidos o DNI para confirmar el estudio");
  }

  const cups = pickFirstString(body.cups, customer?.cups, invoiceData?.cups);
  const direccionCompleta = pickFirstString(
    body.direccion_completa,
    customer?.direccion_completa,
    customer?.address,
    invoiceData?.direccion_completa,
    invoiceData?.address,
    location?.address,
  );
  const iban = pickFirstString(body.iban, customer?.iban, invoiceData?.iban);

  const email =
    pickFirstString(
      body.email,
      customer?.email,
      customer?.correo,
      customer?.mail,
      invoiceData?.email,
      invoiceData?.correo,
    ) ?? null;

  const telefono =
    pickFirstString(
      body.telefono,
      body.phone,
      customer?.telefono,
      customer?.phone,
      customer?.mobile,
      customer?.movil,
      invoiceData?.telefono,
      invoiceData?.phone,
    ) ?? null;

  const codigo_postal =
    pickFirstString(
      body.codigo_postal,
      body.codigoPostal,
      body.postal_code,
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
      body.poblacion,
      body.ciudad,
      body.localidad,
      body.city,
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
      body.provincia,
      body.state,
      customer?.provincia,
      customer?.state,
      invoiceData?.provincia,
      invoiceData?.state,
      location?.provincia,
      location?.state,
    ) ?? null;

  const pais =
    pickFirstString(
      body.pais,
      body.country,
      customer?.pais,
      customer?.country,
      invoiceData?.pais,
      invoiceData?.country,
      location?.pais,
      location?.country,
    ) ?? "España";

  const tipoFacturaRaw = (
    pickFirstString(
      body.tipo_factura,
      customer?.tipo_factura,
      invoiceData?.tipo_factura,
      invoiceData?.billType,
      invoiceData?.tariffType,
    ) || "2TD"
  ).toUpperCase();

  const locationPayload = {
    ...(location ?? {}),
    address: rawAddress || location?.address || null,
    codigo_postal,
    country: pais,
    direccion_completa:
      (direccionCompleta ?? rawAddress) || location?.address || null,
    formatted_address: geocoded?.formattedAddress ?? null,
    lat: geocoded?.lat ?? location?.lat ?? null,
    lng: geocoded?.lng ?? location?.lng ?? null,
    pais,
    place_id: geocoded?.placeId ?? null,
    poblacion,
    provincia,
  };

  const tipo_factura = tipoFacturaRaw === "3TD" ? "3TD" : "2TD";

  const consumo_mensual_real_kwh =
    toNullableNumber(body.consumo_mensual_real_kwh) ??
    toNullableNumber(customer?.consumo_mensual_real_kwh) ??
    toNullableNumber(invoiceData?.consumo_mensual_real_kwh) ??
    toNullableNumber(invoiceData?.monthly_real_consumption_kwh) ??
    null;

  const consumo_medio_mensual_kwh =
    toNullableNumber(body.consumo_medio_mensual_kwh) ??
    toNullableNumber(customer?.consumo_medio_mensual_kwh) ??
    toNullableNumber(invoiceData?.consumo_medio_mensual_kwh) ??
    toNullableNumber(invoiceData?.monthly_average_consumption_kwh) ??
    null;

  const normalizedCustomer = {
    ...(customer ?? {}),
    apellidos,
    codigo_postal,
    cups: cups ?? null,
    direccion_completa: direccionCompleta ?? null,
    dni,
    email,
    iban: iban ?? null,
    nombre,
    pais,
    poblacion,
    provincia,
    telefono,
  };

  let folder: { id: string; webViewLink: string } | null = null;
  let uploadedInvoice: {
    id: string;
    name: string;
    webContentLink: string | null;
    webViewLink: string;
  } | null = null;
  let uploadedProposal: {
    id: string;
    name: string;
    webContentLink: string | null;
    webViewLink: string;
  } | null = null;
  const driveWarnings: string[] = [];

  try {
    folder = await deps.services.drive.ensureClientFolder({
      apellidos,
      dni,
      nombre,
    });

    if (invoiceFile && folder) {
      const extension =
        invoiceFile.originalname.split(".").pop()?.toLowerCase() || "pdf";

      uploadedInvoice = await deps.services.drive.uploadBuffer({
        buffer: invoiceFile.buffer,
        fileName: `FACTURA_${normalizeDriveToken(dni)}.${extension}`,
        folderId: folder.id,
        mimeType: invoiceFile.mimetype,
      });
    }

    if (proposalFile && folder) {
      uploadedProposal = await deps.services.drive.uploadBuffer({
        buffer: proposalFile.buffer,
        fileName: `PROPUESTA_${normalizeDriveToken(dni)}.pdf`,
        folderId: folder.id,
        mimeType: proposalFile.mimetype || "application/pdf",
      });
    }
  } catch (error: any) {
    driveWarnings.push(
      `Google Drive no disponible: ${error?.message || "error desconocido"}. El estudio se ha guardado sin archivos en Drive.`,
    );
  }

  const clientData = await deps.repositories.clients.upsert({
    apellidos,
    codigo_postal,
    consumo_medio_mensual_kwh,
    consumo_mensual_real_kwh,
    cups: cups ?? null,
    datos_adicionales: normalizedCustomer,
    direccion_completa: direccionCompleta ?? null,
    dni,
    drive_folder_id: folder?.id ?? null,
    drive_folder_url: folder?.webViewLink ?? null,
    email,
    factura_drive_file_id: uploadedInvoice?.id ?? null,
    factura_drive_url: uploadedInvoice?.webViewLink ?? null,
    iban: iban ?? null,
    nombre,
    pais,
    poblacion,
    precio_p1_eur_kwh: getPeriodPrice(body, invoiceData, "p1"),
    precio_p2_eur_kwh: getPeriodPrice(body, invoiceData, "p2"),
    precio_p3_eur_kwh: getPeriodPrice(body, invoiceData, "p3"),
    precio_p4_eur_kwh: getPeriodPrice(body, invoiceData, "p4"),
    precio_p5_eur_kwh: getPeriodPrice(body, invoiceData, "p5"),
    precio_p6_eur_kwh: getPeriodPrice(body, invoiceData, "p6"),
    propuesta_drive_file_id: uploadedProposal?.id ?? null,
    propuesta_drive_url: uploadedProposal?.webViewLink ?? null,
    provincia,
    telefono,
    tipo_factura,
  });

  const selectedInstallationId =
    pickFirstString(
      body.selected_installation_id,
      body.selectedInstallationId,
      selectedInstallationSnapshot?.installationId,
      selectedInstallationSnapshot?.installationData?.id,
    ) ?? null;

  const requestedAssignedKwpRaw =
    toNullableNumber(
      body.assignedKwp ??
        body.assigned_kwp ??
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

  let finalSelectedInstallationSnapshot = selectedInstallationSnapshot ?? null;

  if (selectedInstallationId) {
    const capacityState = await getInstallationCapacityState(
      deps,
      selectedInstallationId,
    );

    const resolvedAssignment = resolveAssignedKwpForInstallation({
      installation: capacityState.installation,
      requestedKwp:
        requestedAssignedKwpRaw !== null && requestedAssignedKwpRaw > 0
          ? requestedAssignedKwpRaw
          : 0,
    });

    const effectiveAssignedKwp = resolvedAssignment.assignedKwp;

    if (!(effectiveAssignedKwp > 0)) {
      throw badRequest(
        "No se pudo determinar una potencia asignada válida para la instalación seleccionada",
      );
    }

    if (effectiveAssignedKwp > capacityState.availableKwp) {
      throw badRequest(
        "No hay capacidad suficiente en la instalación seleccionada",
        `Disponibles: ${capacityState.availableKwp.toFixed(
          2,
        )} kWp. Requeridos: ${effectiveAssignedKwp.toFixed(2)} kWp`,
      );
    }

    const nextUsedKwp = capacityState.usedKwp + effectiveAssignedKwp;
    const nextAvailableKwp = Math.max(capacityState.totalKwp - nextUsedKwp, 0);

    finalAssignedKwp = effectiveAssignedKwp;
    finalSelectedInstallationSnapshot = buildInstallationSnapshot({
      assignedKwp: effectiveAssignedKwp,
      availableKwp: nextAvailableKwp,
      calculationMode: resolvedAssignment.calculationMode,
      confirmedKwp: capacityState.confirmedKwp,
      installation: capacityState.installation,
      requestedAssignedKwp:
        requestedAssignedKwpRaw !== null && requestedAssignedKwpRaw > 0
          ? requestedAssignedKwpRaw
          : null,
      reservedKwp: capacityState.reservedKwp,
      source: resolvedAssignment.source,
      totalKwp: capacityState.totalKwp,
      usedKwp: nextUsedKwp,
    });
  }

  const appLanguage = normalizeAppLanguage(body.language);

  const studyData = await deps.repositories.studies.create({
    assigned_kwp: finalAssignedKwp,
    calculation: calculation ?? null,
    consent_accepted: toBoolean(body.consent_accepted),
    customer: normalizedCustomer,
    email_status: "pending",
    invoice_data: invoiceData ?? null,
    language: appLanguage,
    location: locationPayload,
    selected_installation_id: selectedInstallationId,
    selected_installation_snapshot: finalSelectedInstallationSnapshot,
    source_file: {
      ...(sourceFile ?? {}),
      drive_folder_id: folder?.id ?? null,
      drive_folder_url: folder?.webViewLink ?? null,
      invoice_drive_file_id: uploadedInvoice?.id ?? null,
      invoice_drive_url: uploadedInvoice?.webViewLink ?? null,
      mime_type: invoiceFile?.mimetype ?? null,
      original_name: invoiceFile?.originalname ?? null,
      proposal_drive_file_id: uploadedProposal?.id ?? null,
      proposal_drive_url: uploadedProposal?.webViewLink ?? null,
    },
    status: body.status ?? "uploaded",
  });

  let continueContractUrl: string | null = null;
  let continueContractTokenExpiresAt: string | null = null;

  try {
    const access = await createProposalContinueAccessToken(deps, {
      clientId: clientData.id,
      language: appLanguage,
      studyId: studyData.id,
    });
    continueContractUrl = access.continueUrl;
    continueContractTokenExpiresAt = access.expiresAt;
  } catch (error) {
    continueContractUrl = null;
    continueContractTokenExpiresAt = null;
  }

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
      await deps.services.mail.sendProposalEmail({
        clientName: `${nombre} ${apellidos}`.trim(),
        continueContractUrl,
        language: appLanguage,
        pdfBuffer: proposalFile.buffer,
        pdfFilename:
          proposalFile.originalname || `PROPUESTA_${normalizeDriveToken(dni)}.pdf`,
        proposalUrl: uploadedProposal?.webViewLink ?? null,
        to: email,
      });

      emailStatus = "sent";
    } catch (error: any) {
      emailError = error?.message || "Error desconocido al enviar el correo";
    }
  }

  let updatedStudy = studyData;

  if (emailStatus === "sent") {
    updatedStudy = await deps.repositories.studies.update(studyData.id, {
      email_status: "sent",
    });
  }

  return {
    client: clientData,
    drive: {
      folderId: folder?.id ?? null,
      folderUrl: folder?.webViewLink ?? null,
      invoiceUrl: uploadedInvoice?.webViewLink ?? null,
      proposalUrl: uploadedProposal?.webViewLink ?? null,
    },
    email: {
      continueContractTokenExpiresAt,
      continueContractUrl,
      error: emailError,
      status: emailError ? "failed" : emailStatus,
      to: email,
    },
    study: updatedStudy,
    success: true,
    warnings: driveWarnings.length > 0 ? driveWarnings : undefined,
  };
}
