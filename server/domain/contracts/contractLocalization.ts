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
    investment: tServer(language, "contractPdf.modes.investment", "Inversión"),
    service: tServer(language, "contractPdf.modes.service", "Servicio"),
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
