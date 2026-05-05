import type { ServerDependencies } from "../ports/serverDependencies";
import { buildProposalPdfHtml } from "../../domain/proposals/proposalPdfHtml";

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
import {
  isValidCupsFormat,
  normalizeCups,
  normalizeDriveToken,
  pickFirstString,
} from "../../utils/stringUtils";

function hasEmpresaIdColumn(record: Record<string, any> | null | undefined) {
  return Boolean(record) && Object.prototype.hasOwnProperty.call(record, "empresa_id");
}

function stripLegacyDriveFields<T extends Record<string, any> | null | undefined>(
  payload: T,
) {
  if (!payload) {
    return payload ?? null;
  }

  const sanitized = { ...payload };

  delete sanitized.drive_folder_id;
  delete sanitized.drive_folder_url;
  delete sanitized.factura_drive_file_id;
  delete sanitized.factura_drive_url;
  delete sanitized.proposal_drive_file_id;
  delete sanitized.proposal_drive_url;
  delete sanitized.propuesta_drive_file_id;
  delete sanitized.propuesta_drive_url;

  return sanitized;
}

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

  const proposalSupabasePath =
    pickFirstString(
      sourceFile?.proposal_supabase_path,
      sourceFile?.propuesta_supabase_path,
    ) ?? null;

  const proposalSupabaseBucket =
    pickFirstString(
      sourceFile?.proposal_supabase_bucket,
      sourceFile?.propuesta_supabase_bucket,
      sourceFile?.documentos_supabase_bucket,
      sourceFile?.supabase_bucket,
    ) ?? null;

  if (!email) {
    throw badRequest("No se encontró el email del cliente");
  }

  if (!proposalSupabasePath) {
    throw badRequest("No se encontró el PDF de propuesta");
  }

  const proposalPdf = await deps.services.documents.downloadFileAsBuffer({
    bucket: proposalSupabaseBucket,
    path: proposalSupabasePath,
  });

  const clientDni =
    pickFirstString(customer?.dni, customer?.documentNumber) ?? null;

  if (!clientDni) {
    throw badRequest("No se encontró el DNI del cliente en el estudio");
  }

  const installationId = study.selected_installation_id ?? null;

  if (!installationId) {
    throw badRequest("El estudio no tiene instalación seleccionada");
  }

  const installation = await deps.repositories.installations.findById(
    installationId,
  );

  if (!installation) {
    throw notFound("No se encontró la instalación asociada al estudio");
  }

  if (hasEmpresaIdColumn(installation) && !installation.empresa_id) {
    throw badRequest("La instalación seleccionada no tiene empresa asociada");
  }

  const client = await deps.repositories.clients.findByDni({
    dni: clientDni,
    empresaId: hasEmpresaIdColumn(installation) ? installation.empresa_id : null,
  });

  if (!client) {
    throw notFound("No se encontró el cliente asociado al estudio", "Cliente no encontrado");
  }

  const language = normalizeAppLanguage(study.language);
  const access = await createProposalContinueAccessToken(deps, {
    clientId: client.id,
    empresaId: hasEmpresaIdColumn(installation) ? installation.empresa_id : null,
    language,
    studyId: study.id,
  });

  await deps.services.mail.sendProposalEmail({
    clientName: `${nombre} ${apellidos}`.trim(),
    continueContractUrl: access.continueUrl,
    language,
    pdfBuffer: proposalPdf.buffer,
    pdfFilename: proposalPdf.fileName,
    proposalUrl: null,
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

function firstNumber(source: any, keys: string[], fallback = 0): number {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(
        value.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""),
      );
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function normalizeProposalModality(value: unknown): "inversion" | "servicio" | "ambas" {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalized === "inversion" || normalized === "investment") {
    return "inversion";
  }
  if (normalized === "servicio" || normalized === "service") {
    return "servicio";
  }
  return "ambas";
}

function getProposalModesForInstallation(installation: any) {
  const modalidad = normalizeProposalModality(installation?.modalidad);
  if (modalidad === "inversion") return ["investment"] as const;
  if (modalidad === "servicio") return ["service"] as const;
  return ["investment", "service"] as const;
}

function getInvestmentCostForPdf(installation: any, recommendedPowerKwp: number) {
  const fixedAmount = firstNumber(installation, ["cantidad_precio_fijo"], 0);

  if (isFixedInstallationPayment(installation)) {
    return fixedAmount;
  }

  const effectiveHours = firstNumber(installation, ["horas_efectivas"], 0);
  const investmentCostKwh = firstNumber(installation, ["coste_kwh_inversion"], 0);

  if (effectiveHours > 0 && investmentCostKwh > 0 && recommendedPowerKwp > 0) {
    return effectiveHours * investmentCostKwh * recommendedPowerKwp * 25;
  }

  return 0;
}

function isFixedInstallationPayment(installation: any) {
  const mode = String(installation?.pago ?? "")
    .trim()
    .toLowerCase();
  const fixedAmount = firstNumber(installation, ["cantidad_precio_fijo"], 0);

  return mode === "fijo" && fixedAmount > 0;
}

async function buildFinalProposalPdfBuffer(params: {
  calculation: any;
  continueContractUrl: string | null;
  customer: Record<string, any>;
  deps: ServerDependencies;
  installation: Record<string, any>;
  invoiceData: Record<string, any>;
  language: string;
}) {
  const calculation = params.calculation ?? {};
  const installation = params.installation ?? {};
  const invoiceData = params.invoiceData ?? {};
  const customer = params.customer ?? {};

  const recommendedPowerKwp = firstNumber(
    calculation,
    ["recommendedPowerKwp", "recommended_power_kwp"],
    firstNumber(installation, ["potencia_fija_kwp", "assigned_kwp"], 0),
  );
  const annualConsumptionKwh = firstNumber(
    calculation,
    ["annualConsumptionKwh", "annual_consumption_kwh"],
    firstNumber(invoiceData, ["annualConsumptionKwh", "consumo_anual_kwh"], 0),
  );
  const annualServiceFee = firstNumber(
    calculation,
    ["annualServiceFee", "serviceCost"],
    0,
  );
  const monthlyFee = annualServiceFee > 0 ? annualServiceFee / 12 : null;
  const investmentCost = getInvestmentCostForPdf(
    installation,
    recommendedPowerKwp,
  );
  const annualSavingsInvestment = firstNumber(calculation, [
    "annualSavingsInvestment",
    "annual_savings_investment",
  ]);
  const annualSavingsService = firstNumber(calculation, [
    "annualSavingsService",
    "annual_savings_service",
  ]);
  const company = installation.empresa ?? installation.empresas ?? {};
  const companyName = company.nombre ?? null;
  const companyEmail = company.email ?? null;
  const companyPhone = company.telefono ?? null;
  const totalSavings25YearsInvestment = firstNumber(calculation, [
    "totalSavings25YearsInvestment",
    "annualSavings25YearsInvestment",
  ]);
  const totalSavings25YearsService = firstNumber(calculation, [
    "totalSavings25YearsService",
    "annualSavings25YearsService",
  ]);

  const proposalSummaries = getProposalModesForInstallation(installation).map(
    (mode) => {
      if (mode === "service") {
        return {
          annualConsumptionKwh,
          annualMaintenance: 0,
          annualSavings: annualSavingsService,
          badge: "Flexible",
          description: "Modelo que reduce la barrera de entrada.",
          companyEmail,
          companyName,
          companyPhone,
          energyPriceKwh: isFixedInstallationPayment(installation)
            ? null
            : firstNumber(installation, ["coste_kwh_servicio"], 0),
          installationAddress: installation.direccion ?? null,
          installationName: installation.nombre_instalacion ?? null,
          mode,
          monthlyFee,
          paybackYears: 0,
          recommendedPowerKwp,
          title: "Servicio",
          totalSavings25Years: totalSavings25YearsService,
          upfrontCost: 0,
        };
      }

      return {
        annualConsumptionKwh,
        annualMaintenance: firstNumber(calculation, ["annualMaintenanceCost"], 0),
        annualSavings: annualSavingsInvestment,
        badge: "Recomendado",
        companyEmail,
        companyName,
        companyPhone,
        description: "Realizas la inversión y maximizas el ahorro a largo plazo.",
        energyPriceKwh: isFixedInstallationPayment(installation)
          ? null
          : firstNumber(installation, ["coste_kwh_inversion"], 0),
        installationAddress: installation.direccion ?? null,
        installationName: installation.nombre_instalacion ?? null,
        mode,
        monthlyFee: null,
        paybackYears:
          annualSavingsInvestment > 0 && investmentCost > 0
            ? investmentCost / annualSavingsInvestment
            : 0,
        recommendedPowerKwp,
        title: "Inversión",
        totalSavings25Years: totalSavings25YearsInvestment,
        upfrontCost: investmentCost,
      };
    },
  );

  const billData = {
    address:
      customer.direccion_completa ??
      customer.address ??
      invoiceData.direccion_completa ??
      invoiceData.address ??
      "-",
    billType: invoiceData.billType ?? invoiceData.tipo_factura ?? "2TD",
    contractedPowerKw: firstNumber(invoiceData, [
      "contractedPowerKw",
      "potencia_contratada_kw",
      "potenciaContratadaKw",
    ]),
    contractedPowerText:
      invoiceData.contractedPowerText ??
      invoiceData.potencia_contratada_texto ??
      undefined,
    cups: customer.cups ?? invoiceData.cups ?? "ES000000000000000000",
    dni: customer.dni ?? invoiceData.dni ?? "00000000T",
    email: customer.email ?? invoiceData.email ?? "cliente@example.com",
    iban: customer.iban ?? invoiceData.iban ?? "ES0000000000000000000000",
    lastName: customer.apellidos ?? customer.lastName ?? "",
    monthlyConsumption:
      firstNumber(calculation, ["averageMonthlyConsumptionKwh"], 0) ||
      firstNumber(invoiceData, ["monthlyConsumption", "consumo_medio_mensual_kwh"], 1),
    name: customer.nombre ?? customer.name ?? "Cliente",
    phone: customer.telefono ?? customer.phone ?? "000000000",
  };

  const html = buildProposalPdfHtml({
    billData: billData as any,
    calculationResult: calculation,
    continueContractUrl: params.continueContractUrl,
    language: params.language as any,
    proposals: proposalSummaries as any,
  });

  return params.deps.services.pdf.convertHtmlToPdf({ html });
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

  const rawCups = pickFirstString(body.cups, customer?.cups, invoiceData?.cups);
  const normalizedCups = normalizeCups(rawCups);
  const persistedCups =
    normalizedCups && isValidCupsFormat(normalizedCups)
      ? normalizedCups
      : null;
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

  const selectedInstallationId =
    pickFirstString(
      body.selected_installation_id,
      body.selectedInstallationId,
      selectedInstallationSnapshot?.id,
      selectedInstallationSnapshot?.installationId,
      selectedInstallationSnapshot?.installationData?.id,
    ) ?? null;

  console.log("[confirm-study] selectedInstallationId:", selectedInstallationId);

  if (!selectedInstallationId) {
    throw badRequest("Debes seleccionar una instalación antes de confirmar el estudio");
  }

  const selectedInstallation = await deps.repositories.installations.findById(
    selectedInstallationId,
  );

  if (!selectedInstallation) {
    throw notFound("No se encontró la instalación seleccionada");
  }

  if (hasEmpresaIdColumn(selectedInstallation) && !selectedInstallation.empresa_id) {
    throw badRequest("La instalación seleccionada no tiene empresa asociada");
  }

  const empresaId = hasEmpresaIdColumn(selectedInstallation)
    ? selectedInstallation.empresa_id
    : null;

  console.log("[confirm-study] selectedInstallation empresa_id:", empresaId);

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

  const bic =
    pickFirstString(body.bic, customer?.bic, invoiceData?.bic) ?? null;

  const normalizedCustomer = {
    ...(customer ?? {}),
    apellidos,
    codigo_postal,
    cups: normalizedCups ?? rawCups ?? null,
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

  let storageFolderPath: string | null = null;
  let storageBucket: string | null = null;
  let uploadedInvoice: {
    bucket: string;
    fileName: string;
    folderPath: string;
    mimeType: string;
    path: string;
  } | null = null;
  let uploadedProposal: {
    bucket: string;
    fileName: string;
    folderPath: string;
    mimeType: string;
    path: string;
  } | null = null;
  const storageWarnings: string[] = [];

  try {
    if (invoiceFile) {
      uploadedInvoice = await deps.services.documents.uploadClientDocument({
        apellidos,
        buffer: invoiceFile.buffer,
        dni,
        fileName: "factura.pdf",
        mimeType: invoiceFile.mimetype,
        nombre,
      });
    }

    if (proposalFile) {
      uploadedProposal = await deps.services.documents.uploadClientDocument({
        apellidos,
        buffer: proposalFile.buffer,
        dni,
        fileName: "propuesta.pdf",
        mimeType: proposalFile.mimetype || "application/pdf",
        nombre,
      });
    }

    storageFolderPath =
      uploadedInvoice?.folderPath ?? uploadedProposal?.folderPath ?? null;
    storageBucket = uploadedInvoice?.bucket ?? uploadedProposal?.bucket ?? null;
  } catch (error: any) {
    storageWarnings.push(
      `Supabase Storage no disponible: ${error?.message || "error desconocido"}. El estudio se ha guardado sin archivos.`,
    );
  }

  const clientPayload: Record<string, any> = {
    apellidos: apellidos ?? "",
    bic,
    codigo_postal: codigo_postal ?? "",
    consumo_medio_mensual_kwh,
    consumo_mensual_real_kwh,
    cups: persistedCups,
    datos_adicionales: customer?.datos_adicionales ?? {},
    direccion_completa: direccionCompleta ?? "",
    dni,
    documentos_supabase_bucket: storageBucket,
    email: email ?? "",
    factura_supabase_path: uploadedInvoice?.path ?? null,
    iban: iban || null,
    nombre: nombre ?? "",
    pais: pais ?? "España",
    poblacion: poblacion ?? "",
    precio_p1_eur_kwh: getPeriodPrice(body, invoiceData, "p1"),
    precio_p2_eur_kwh: getPeriodPrice(body, invoiceData, "p2"),
    precio_p3_eur_kwh: getPeriodPrice(body, invoiceData, "p3"),
    precio_p4_eur_kwh: getPeriodPrice(body, invoiceData, "p4"),
    precio_p5_eur_kwh: getPeriodPrice(body, invoiceData, "p5"),
    precio_p6_eur_kwh: getPeriodPrice(body, invoiceData, "p6"),
    propuesta_supabase_path: uploadedProposal?.path ?? null,
    provincia: provincia ?? "",
    supabase_folder_path: storageFolderPath,
    telefono: telefono ?? "",
    tipo_factura: tipo_factura || null,
  };

  if (empresaId) {
    clientPayload.empresa_id = empresaId;
  }

  console.log("[confirm-study] client dni:", clientPayload.dni);

  const clientData = await deps.repositories.clients.upsert(clientPayload);

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
    empresa_id: empresaId,
    invoice_data: invoiceData ?? null,
    language: appLanguage,
    location: locationPayload,
    selected_installation_id: selectedInstallationId,
    selected_installation_snapshot: finalSelectedInstallationSnapshot,
    source_file: {
      ...(stripLegacyDriveFields(sourceFile) ?? {}),
      documentos_supabase_bucket: storageBucket,
      factura_supabase_path: uploadedInvoice?.path ?? null,
      mime_type: invoiceFile?.mimetype ?? null,
      original_name: invoiceFile?.originalname ?? null,
      propuesta_supabase_path: uploadedProposal?.path ?? null,
      supabase_folder_path: storageFolderPath,
    },
    status: body.status ?? "uploaded",
  });

  let continueContractUrl: string | null = null;
  let continueContractTokenExpiresAt: string | null = null;

  try {
    const access = await createProposalContinueAccessToken(deps, {
      clientId: clientData.id,
      empresaId,
      language: appLanguage,
      studyId: studyData.id,
    });
    continueContractUrl = access.continueUrl;
    continueContractTokenExpiresAt = access.expiresAt;
  } catch (error) {
    continueContractUrl = null;
    continueContractTokenExpiresAt = null;
  }

  let finalProposalPdfBuffer = proposalFile?.buffer ?? null;
  let finalProposalPdfFilename =
    proposalFile?.originalname || `PROPUESTA_${normalizeDriveToken(dni)}.pdf`;

  if (continueContractUrl) {
    try {
      finalProposalPdfBuffer = await buildFinalProposalPdfBuffer({
        calculation,
        continueContractUrl,
        customer: normalizedCustomer,
        deps,
        installation: {
          ...selectedInstallation,
          assigned_kwp: finalAssignedKwp,
          requested_assigned_kwp: requestedAssignedKwpRaw,
        },
        invoiceData,
        language: appLanguage,
      });
      finalProposalPdfFilename = `PROPUESTA_${normalizeDriveToken(dni)}.pdf`;

      uploadedProposal = await deps.services.documents.uploadClientDocument({
        apellidos,
        buffer: finalProposalPdfBuffer,
        dni,
        fileName: "propuesta.pdf",
        mimeType: "application/pdf",
        nombre,
      });
      storageFolderPath =
        uploadedInvoice?.folderPath ?? uploadedProposal?.folderPath ?? storageFolderPath;
      storageBucket =
        uploadedInvoice?.bucket ?? uploadedProposal?.bucket ?? storageBucket;
    } catch (error: any) {
      storageWarnings.push(
        `No se pudo regenerar la propuesta con enlace de contratación: ${
          error?.message || "error desconocido"
        }`,
      );
    }
  }

  let emailStatus: "pending" | "sent" = "pending";
  let emailError: string | null = null;

  if (!email) {
    emailError = "No se encontró email del cliente";
  } else if (!finalProposalPdfBuffer) {
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
        pdfBuffer: finalProposalPdfBuffer,
        pdfFilename: finalProposalPdfFilename,
        proposalUrl: null,
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
    storage: {
      bucket: storageBucket,
      folderPath: storageFolderPath,
      invoicePath: uploadedInvoice?.path ?? null,
      proposalPath: uploadedProposal?.path ?? null,
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
    warnings: storageWarnings.length > 0 ? storageWarnings : undefined,
  };
}
