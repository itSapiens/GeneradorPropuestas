import esTranslations from "../../../src/i18n/locales/es/translation.json";
import caTranslations from "../../../src/i18n/locales/ca/translation.json";
import valTranslations from "../../../src/i18n/locales/val/translation.json";
import glTranslations from "../../../src/i18n/locales/gal/translation.json";

export type ProposalMode = "investment" | "service";
export type AppLanguage = "es" | "ca" | "val" | "gl";

const TRANSLATIONS = {
  es: esTranslations,
  ca: caTranslations,
  val: valTranslations,
  gl: glTranslations,
} as const;

function getNestedTranslation(
  obj: Record<string, any> | undefined,
  path: string,
): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function tServer(
  language: AppLanguage,
  path: string,
  fallback?: string,
): string {
  const localized = getNestedTranslation(TRANSLATIONS[language], path);
  if (typeof localized === "string") return localized;

  const base = getNestedTranslation(TRANSLATIONS.es, path);
  if (typeof base === "string") return base;

  return fallback ?? path;
}

export function fillTranslationTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (result, [key, value]) =>
      result.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

function normalizeInstallationModalidad(
  modalidad: unknown,
): "inversion" | "servicio" | "ambas" {
  const value = String(modalidad || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (value === "inversion") return "inversion";
  if (value === "servicio" || value === "service") return "servicio";
  if (value === "ambas") return "ambas";

  return "ambas";
}

export function normalizeAppLanguage(value: unknown): AppLanguage {
  const lang = String(value || "")
    .trim()
    .toLowerCase();

  if (lang === "ca") return "ca";
  if (lang === "val") return "val";
  if (lang === "gl" || lang === "gal") return "gl";
  return "es";
}

export function getLocaleFromLanguage(language: AppLanguage): string {
  if (language === "ca" || language === "val") return "ca-ES";
  if (language === "gl") return "gl-ES";
  return "es-ES";
}

export function formatCurrencyByLanguage(
  amount: number,
  currency: string,
  language: AppLanguage,
): string {
  return new Intl.NumberFormat(getLocaleFromLanguage(language), {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
}

export function getContractTexts(language: AppLanguage) {
  return {
    htmlLang: tServer(language, "contractPdf.htmlLang", "es"),
    title: tServer(language, "contractPdf.title", "Contrato de adhesión"),
    contractNumber: tServer(
      language,
      "contractPdf.contractNumber",
      "Contrato nº",
    ),
    date: tServer(language, "contractPdf.date", "Fecha"),
    clientData: tServer(language, "contractPdf.clientData", "Datos del cliente"),
    name: tServer(language, "contractPdf.name", "Nombre"),
    dni: tServer(language, "contractPdf.dni", "DNI"),
    email: tServer(language, "contractPdf.email", "Email"),
    phone: tServer(language, "contractPdf.phone", "Teléfono"),
    address: tServer(language, "contractPdf.address", "Dirección"),
    installationData: tServer(
      language,
      "contractPdf.installationData",
      "Datos de la instalación",
    ),
    installation: tServer(language, "contractPdf.installation", "Instalación"),
    company: tServer(language, "contractPdf.company", "Empresa"),
    taxId: tServer(language, "contractPdf.taxId", "CIF"),
    mode: tServer(language, "contractPdf.mode", "Modalidad"),
    assignedKwp: tServer(language, "contractPdf.assignedKwp", "kWp asignados"),
    basicConditions: tServer(
      language,
      "contractPdf.basicConditions",
      "Condiciones básicas",
    ),
    condition1: tServer(language, "contractPdf.condition1"),
    condition2: tServer(language, "contractPdf.condition2"),
    condition3: tServer(language, "contractPdf.condition3"),
    transferInstructionsTitle: tServer(
      language,
      "contractPdf.transferInstructionsTitle",
      "Transferencia bancaria",
    ),
    transferInstructionsDescription: tServer(
      language,
      "contractPdf.transferInstructionsDescription",
      "Para confirmar la reserva, realiza la transferencia bancaria al IBAN de la instalación indicando exactamente el concepto señalado.",
    ),
    transferIban: tServer(language, "contractPdf.transferIban", "IBAN"),
    transferConcept: tServer(
      language,
      "contractPdf.transferConcept",
      "Concepto",
    ),
    clientSignature: tServer(
      language,
      "contractPdf.clientSignature",
      "Firma del cliente",
    ),
    selectedMode: tServer(
      language,
      "contractPdf.selectedMode",
      "Modalidad contratada",
    ),
    availableModes: tServer(
      language,
      "contractPdf.availableModes",
      "Modalidades disponibles",
    ),
    selectedServicePrice: tServer(
      language,
      "contractPdf.selectedServicePrice",
      "Precio del servicio",
    ),
    selectedInvestmentPrice: tServer(
      language,
      "contractPdf.selectedInvestmentPrice",
      "Precio de la inversión",
    ),
    reservation: tServer(language, "contractPdf.reservation", "Reserva"),
    fixedReservationAmount: tServer(
      language,
      "contractPdf.fixedReservationAmount",
      "Importe fijo de reserva",
    ),
    reservationByAssignedPower: tServer(
      language,
      "contractPdf.reservationByAssignedPower",
      "Reserva aplicada a la potencia asignada",
    ),
    annualMaintenance: tServer(
      language,
      "contractPdf.annualMaintenance",
      "Mantenimiento anual",
    ),
    overAssignedPower: tServer(
      language,
      "contractPdf.overAssignedPower",
      "Sobre {{value}} kWp asignados",
    ),
    investmentPrice: tServer(
      language,
      "contractPdf.investmentPrice",
      "Precio inversión",
    ),
    servicePrice: tServer(
      language,
      "contractPdf.servicePrice",
      "Precio servicio",
    ),
    installedPower: tServer(
      language,
      "contractPdf.installedPower",
      "Potencia instalada",
    ),
    battery: tServer(language, "contractPdf.battery", "Batería"),
    effectiveHours: tServer(
      language,
      "contractPdf.effectiveHours",
      "Horas efectivas",
    ),
    estimatedSelfConsumption: tServer(
      language,
      "contractPdf.estimatedSelfConsumption",
      "Autoconsumo estimado",
    ),
    oneTimePayment: tServer(
      language,
      "contractPdf.oneTimePayment",
      "pago único",
    ),
    perMonth: tServer(language, "contractPdf.perMonth", "/mes"),
    investment: tServer(language, "contractPdf.modes.investment", "Inversión"),
    service: tServer(language, "contractPdf.modes.service", "Servicio"),
    extraConsumption: tServer(language, "contractPdf.extraConsumption", "Consumo adicional declarado"),
    extraConsumptionEv: tServer(language, "contractPdf.extraConsumptionEv", "Coche eléctrico"),
    extraConsumptionHvac: tServer(language, "contractPdf.extraConsumptionHvac", "Climatización"),
    extraConsumptionEvKm: tServer(language, "contractPdf.extraConsumptionEvKm", "km/año"),
    extraConsumptionHvacM2: tServer(language, "contractPdf.extraConsumptionHvacM2", "m²"),
  };
}

export function getProposalPdfTexts(language: AppLanguage) {
  return {
    participationOptions: tServer(
      language,
      "emails.proposalPdf.flow.participationOptions",
      "Dos formas de participar",
    ),
    availableMode: tServer(
      language,
      "emails.proposalPdf.flow.availableMode",
      "Modalidad disponible",
    ),
    yourContracting: tServer(
      language,
      "emails.proposalPdf.flow.yourContracting",
      "Tu contratación",
    ),
    coverEyebrow: tServer(
      language,
      "emails.proposalPdf.flow.coverEyebrow",
      "Propuesta · Participación",
    ),
    coverTitleHtml: tServer(
      language,
      "emails.proposalPdf.flow.coverTitleHtml",
      "La energía, <em>en tus manos</em> sin tocar tu tejado.",
    ),
    coverDescription: tServer(
      language,
      "emails.proposalPdf.flow.coverDescription",
      "Participa en la planta solar comunitaria de tu zona. Sin obras, sin cambio de compañía, y con un ahorro real en tu factura.",
    ),
    todayWithoutParticipation: tServer(
      language,
      "emails.proposalPdf.flow.todayWithoutParticipation",
      "Hoy · Sin participación",
    ),
    currentBillLabel: tServer(
      language,
      "emails.proposalPdf.flow.currentBillLabel",
      "Tu factura actual",
    ),
    serviceCardLabel: tServer(
      language,
      "emails.proposalPdf.flow.serviceCardLabel",
      "Servicio",
    ),
    investmentCardLabel: tServer(
      language,
      "emails.proposalPdf.flow.investmentCardLabel",
      "Inversión",
    ),
    serviceCardTitle: tServer(
      language,
      "emails.proposalPdf.flow.serviceCardTitle",
      "Cuota mensual",
    ),
    investmentCardTitle: tServer(
      language,
      "emails.proposalPdf.flow.investmentCardTitle",
      "Pago único",
    ),
    serviceCardDescription: tServer(
      language,
      "emails.proposalPdf.flow.serviceCardDescription",
      "Sin inversión inicial. Ahorro neto desde el primer mes. Cancela cuando quieras.",
    ),
    serviceOrbLabel: tServer(
      language,
      "emails.proposalPdf.flow.serviceOrbLabel",
      "Con cuota mensual",
    ),
    investmentOrbLabel: tServer(
      language,
      "emails.proposalPdf.flow.investmentOrbLabel",
      "Con pago único",
    ),
    participationFooterTitle: tServer(
      language,
      "emails.proposalPdf.flow.participationFooterTitle",
      "Tu participación en la planta",
    ),
    panelsLabel: tServer(
      language,
      "emails.proposalPdf.flow.panelsLabel",
      "Paneles",
    ),
    annualProductionLabel: tServer(
      language,
      "emails.proposalPdf.flow.annualProductionLabel",
      "Producción anual",
    ),
    plantDistanceLabel: tServer(
      language,
      "emails.proposalPdf.flow.plantDistanceLabel",
      "Distancia planta",
    ),
    formsAndNextStep: tServer(
      language,
      "emails.proposalPdf.flow.formsAndNextStep",
      "Formas de participar · Siguiente paso",
    ),
    annualSavingsLabel: tServer(
      language,
      "emails.proposalPdf.flow.annualSavingsLabel",
      "Ahorro / año",
    ),
    returnLabel: tServer(
      language,
      "emails.proposalPdf.flow.returnLabel",
      "Retorno",
    ),
    reserveCta: tServer(
      language,
      "emails.proposalPdf.flow.reserveCta",
      "Reservar →",
    ),
    recommendedBadge: tServer(
      language,
      "emails.proposalPdf.flow.recommendedBadge",
      "RECOMENDADO",
    ),
    recommendedTag: tServer(
      language,
      "emails.proposalPdf.flow.recommendedTag",
      "★ RECOM.",
    ),
    reportPrefix: tServer(
      language,
      "emails.proposalPdf.flow.reportPrefix",
      "Informe",
    ),
    stabilityTitle: tServer(
      language,
      "emails.proposalPdf.chart.stabilityTitle",
      "Estabilidad opción Sapiens · 25 años",
    ),
    stabilityNote: tServer(
      language,
      "emails.proposalPdf.chart.stabilityNote",
      "La factura actual sube un 3% anual. Las opciones Sapiens mantienen precio estable e indican coste total a 25 años.",
    ),
    participationPriceTitle: tServer(
      language,
      "emails.proposalPdf.chart.participationPriceTitle",
      "Precio energía con participación · 25 años",
    ),
    currentBillLegend: tServer(
      language,
      "emails.proposalPdf.chart.currentBillLegend",
      "Precio actual factura",
    ),
    serviceLegend: tServer(
      language,
      "emails.proposalPdf.chart.serviceLegend",
      "Servicio",
    ),
    investmentLegend: tServer(
      language,
      "emails.proposalPdf.chart.investmentLegend",
      "Inversión",
    ),
    stablePrice: tServer(
      language,
      "emails.proposalPdf.chart.stablePrice",
      "estable",
    ),
    totalCost25Years: tServer(
      language,
      "emails.proposalPdf.chart.totalCost25Years",
      "coste 25 años",
    ),
    fixedPaymentLegendTemplate: tServer(
      language,
      "emails.proposalPdf.chart.fixedPaymentLegendTemplate",
      "{{mode}}: {{amount}} {{unit}} · coste total: {{total}}",
    ),
    year1: tServer(language, "emails.proposalPdf.chart.year1", "AÑO 1"),
    year25: tServer(language, "emails.proposalPdf.chart.year25", "AÑO 25"),
    stabilityVsActual: tServer(language, "emails.proposalPdf.chart.stabilityVsActual", "/ ACTUAL"),
    stabilityAt12Years: tServer(language, "emails.proposalPdf.chart.stabilityAt12Years", "A 12 AÑOS (ACUMULADO)"),
    stabilityAt25Years: tServer(language, "emails.proposalPdf.chart.stabilityAt25Years", "A 25 AÑOS (ACUMULADO)"),
    impactTitle: tServer(
      language,
      "emails.proposalPdf.impact.title",
      "Tu impacto ambiental · 25 años",
    ),
    co2Label: tServer(
      language,
      "emails.proposalPdf.impact.co2Label",
      "CO₂ evitado",
    ),
    treesLabel: tServer(
      language,
      "emails.proposalPdf.impact.treesLabel",
      "Árboles",
    ),
    cleanEnergyLabel: tServer(
      language,
      "emails.proposalPdf.impact.cleanEnergyLabel",
      "Energía limpia",
    ),
    dieselAvoidedLabel: tServer(
      language,
      "emails.proposalPdf.impact.dieselAvoidedLabel",
      "Diésel evitado",
    ),
    ctaEyebrow: tServer(
      language,
      "emails.proposalPdf.cta.eyebrow",
      "Siguiente paso",
    ),
    ctaTitle: tServer(
      language,
      "emails.proposalPdf.cta.title",
      "¿Reserva tu participación",
    ),
    clientFallback: tServer(
      language,
      "emails.proposalPdf.dynamic.clientFallback",
      "Cliente",
    ),
    pendingLocation: tServer(
      language,
      "emails.proposalPdf.dynamic.pendingLocation",
      "Ubicación pendiente",
    ),
    assignedPlant: tServer(
      language,
      "emails.proposalPdf.dynamic.assignedPlant",
      "Planta asignada",
    ),
    pendingContact: tServer(
      language,
      "emails.proposalPdf.dynamic.pendingContact",
      "Contacto pendiente",
    ),
    annualSuffix: tServer(
      language,
      "emails.proposalPdf.dynamic.annualSuffix",
      "/año",
    ),
    monthSuffix: tServer(
      language,
      "emails.proposalPdf.dynamic.monthSuffix",
      "/mes",
    ),
    perKwh: tServer(
      language,
      "emails.proposalPdf.dynamic.perKwh",
      "€ / kWh",
    ),
    plusTaxes: tServer(
      language,
      "emails.proposalPdf.dynamic.plusTaxes",
      "€ + impuestos",
    ),
    noEntry: tServer(
      language,
      "emails.proposalPdf.dynamic.noEntry",
      "sin entrada",
    ),
    yearsLabel: tServer(
      language,
      "emails.proposalPdf.dynamic.yearsLabel",
      "años",
    ),
    unitsLabel: tServer(
      language,
      "emails.proposalPdf.dynamic.unitsLabel",
      "uds.",
    ),
    distanceValue: tServer(
      language,
      "emails.proposalPdf.dynamic.distanceValue",
      "< 5 km",
    ),
    oneTimeUnit: tServer(
      language,
      "emails.proposalPdf.dynamic.oneTimeUnit",
      "una vez",
    ),
    upToCheaperTemplate: tServer(
      language,
      "emails.proposalPdf.dynamic.upToCheaperTemplate",
      "hasta un {{value}} más barato",
    ),
    investmentCardDescriptionTemplate: tServer(
      language,
      "emails.proposalPdf.dynamic.investmentCardDescriptionTemplate",
      "Máxima rentabilidad. Retorno en {{payback}}. Ahorro acumulado 25 años: {{savings}}.",
    ),
  };
}

export function getPaymentReceiptTexts(language: AppLanguage) {
  return {
    title: tServer(language, "paymentReceipt.title", "Justificante de pago"),
    precontractLabel: tServer(
      language,
      "paymentReceipt.precontractLabel",
      "Precontrato",
    ),
    holderSection: tServer(language, "paymentReceipt.holderSection", "Titular"),
    client: tServer(language, "paymentReceipt.client", "Cliente"),
    dni: tServer(language, "paymentReceipt.dni", "DNI"),
    reservationSection: tServer(
      language,
      "paymentReceipt.reservationSection",
      "Reserva",
    ),
    contractId: tServer(language, "paymentReceipt.contractId", "Contrato ID"),
    reservationId: tServer(
      language,
      "paymentReceipt.reservationId",
      "Reserva ID",
    ),
    installation: tServer(
      language,
      "paymentReceipt.installation",
      "Instalación",
    ),
    reservedPower: tServer(
      language,
      "paymentReceipt.reservedPower",
      "Potencia reservada",
    ),
    paidAmount: tServer(language, "paymentReceipt.paidAmount", "Importe abonado"),
    currency: tServer(language, "paymentReceipt.currency", "Moneda"),
    paymentDate: tServer(language, "paymentReceipt.paymentDate", "Fecha de pago"),
    stripeSection: tServer(
      language,
      "paymentReceipt.stripeSection",
      "Referencia Stripe",
    ),
    checkoutSessionId: tServer(
      language,
      "paymentReceipt.checkoutSessionId",
      "Checkout Session ID",
    ),
    paymentIntentId: tServer(
      language,
      "paymentReceipt.paymentIntentId",
      "Payment Intent ID",
    ),
    footer: tServer(
      language,
      "paymentReceipt.footer",
      "Este documento acredita la recepción de la señal asociada al precontrato de reserva/participación.",
    ),
  };
}

export function getAllowedProposalModes(modalidad: unknown): ProposalMode[] {
  const normalized = normalizeInstallationModalidad(modalidad);

  if (normalized === "inversion") return ["investment"];
  if (normalized === "servicio") return ["service"];
  return ["investment", "service"];
}

export function resolveProposalMode(
  requestedMode: unknown,
  installationModalidad: unknown,
): ProposalMode {
  const requested: ProposalMode =
    requestedMode === "service" ? "service" : "investment";

  const allowedModes = getAllowedProposalModes(installationModalidad);

  return allowedModes.includes(requested)
    ? requested
    : (allowedModes[0] ?? "investment");
}

export function getProposalModeLabel(
  mode: ProposalMode,
  language: AppLanguage,
): string {
  const texts = getContractTexts(language);
  return mode === "investment" ? texts.investment : texts.service;
}
