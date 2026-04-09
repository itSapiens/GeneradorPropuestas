import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
// Cargamos .env.local primero (convención vite/next: valores locales que
// no se commitean) y luego .env como fallback. `override: false` evita que
// un .env reescriba valores que ya estén en el entorno real (CI/prod).
dotenv.config({ path: ".env.local", override: false });
dotenv.config({ override: false });
import Stripe from "stripe";
import cors from "cors";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { extractInvoiceWithFallback } from "./src/services/invoiceExtractionOrchestrator";
import { google } from "googleapis";
import { Readable } from "node:stream";
import fs from "node:fs";
import {
  sendProposalEmail,
  sendReservationConfirmedEmail,
  sendBankTransferReservationEmail,
} from "./src/services/mailer.service";
// dotenv.config();
import esTranslations from "./src/i18n/locales/es/translation.json";
import caTranslations from "./src/i18n/locales/ca/translation.json";
import valTranslations from "./src/i18n/locales/val/translation.json";
import glTranslations from "./src/i18n/locales/gal/translation.json";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { jsPDF } from "jspdf";
const PORT = Number(process.env.PORT || 3000);
const SAPIENS_CONTACT_PHONE =
  process.env.SAPIENS_CONTACT_PHONE || "960 99 27 77";
const SAPIENS_CONTACT_EMAIL =
  process.env.SAPIENS_CONTACT_EMAIL || "info@sapiensenergia.es";

const SAPIENS_BANK_ACCOUNT_IBAN =
  process.env.SAPIENS_BANK_ACCOUNT_IBAN || "ES7001822339620201642233";

//Strine

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const DEFAULT_SIGNAL_AMOUNT_EUR = Number(
  process.env.DEFAULT_SIGNAL_AMOUNT_EUR || 0.5, //Cambiar a 500
);

if (!STRIPE_SECRET_KEY) {
  throw new Error("Falta STRIPE_SECRET_KEY en .env");
}

if (!STRIPE_WEBHOOK_SECRET) {
  throw new Error("Falta STRIPE_WEBHOOK_SECRET en .env");
}

const stripe = new Stripe(STRIPE_SECRET_KEY);

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  process.env.VITE_FRONTEND_URL ||
  `http://localhost:${PORT}`;

const CONTRACT_RESUME_JWT_SECRET = process.env.CONTRACT_RESUME_JWT_SECRET || "";

if (!CONTRACT_RESUME_JWT_SECRET) {
  throw new Error("Falta CONTRACT_RESUME_JWT_SECRET en .env");
}

const GOOGLE_MAPS_GEOCODING_API_KEY =
  process.env.GOOGLE_MAPS_GEOCODING_API_KEY || "";

if (!GOOGLE_MAPS_GEOCODING_API_KEY) {
  throw new Error("Falta GOOGLE_MAPS_GEOCODING_API_KEY en .env");
}

/**
 * Radio de búsqueda de instalaciones alrededor del cliente (metros).
 *
 * Actualmente fijado en 5 km por restricción legislativa:
 *   - Autoconsumo colectivo con excedentes a través de red
 *     (RD 244/2019 modificado por el RDL 2019/2024): exige que los consumidores
 *     asociados estén a menos de 5 km de la instalación de generación.
 *
 * Si el marco regulatorio cambia (por ejemplo, amplía a 60 km o elimina el
 * límite), basta con ajustar INSTALLATION_SEARCH_RADIUS_METERS en el .env.
 */
const INSTALLATION_SEARCH_RADIUS_METERS = Number(
  process.env.INSTALLATION_SEARCH_RADIUS_METERS || 5000,
);

if (
  !Number.isFinite(INSTALLATION_SEARCH_RADIUS_METERS) ||
  INSTALLATION_SEARCH_RADIUS_METERS <= 0
) {
  throw new Error(
    `INSTALLATION_SEARCH_RADIUS_METERS debe ser un número positivo. Recibido: "${process.env.INSTALLATION_SEARCH_RADIUS_METERS}"`,
  );
}

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el archivo .env",
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const GOOGLE_SERVICE_ACCOUNT_EMAIL =
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";

const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || "")
  .replace(/\\n/g, "\n")
  .replace(/^"|"$/g, "");

const GOOGLE_DRIVE_ROOT_FOLDER_ID =
  process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "";

if (
  !GOOGLE_SERVICE_ACCOUNT_EMAIL ||
  !GOOGLE_PRIVATE_KEY ||
  !GOOGLE_DRIVE_ROOT_FOLDER_ID
) {
  throw new Error(
    "Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY o GOOGLE_DRIVE_ROOT_FOLDER_ID en .env",
  );
}

function normalizeDriveToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase();
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function buildClientFolderName(
  dni: string,
  nombre: string,
  apellidos: string,
): string {
  return `${normalizeDriveToken(dni)}-${normalizeDriveToken(
    nombre,
  )}_${normalizeDriveToken(apellidos)}`;
}

function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}
type ProposalMode = "investment" | "service";
type AppLanguage = "es" | "ca" | "val" | "gl";

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

function getLocaleFromLanguage(language: AppLanguage): string {
  if (language === "ca" || language === "val") return "ca-ES";
  if (language === "gl") return "gl-ES";
  return "es-ES";
}

function formatCurrencyByLanguage(
  amount: number,
  currency: string,
  language: AppLanguage,
): string {
  return new Intl.NumberFormat(getLocaleFromLanguage(language), {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount);
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

function normalizeAppLanguage(value: unknown): AppLanguage {
  const lang = String(value || "")
    .trim()
    .toLowerCase();

  if (lang === "ca") return "ca";
  if (lang === "val") return "val";
  if (lang === "gl" || lang === "gal") return "gl";
  return "es";
}
function getContractTexts(language: AppLanguage) {
  return {
    htmlLang: tServer(language, "contractPdf.htmlLang", "es"),
    title: tServer(language, "contractPdf.title", "Contrato de adhesión"),
    contractNumber: tServer(
      language,
      "contractPdf.contractNumber",
      "Contrato nº",
    ),
    date: tServer(language, "contractPdf.date", "Fecha"),
    clientData: tServer(
      language,
      "contractPdf.clientData",
      "Datos del cliente",
    ),
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
    clientSignature: tServer(
      language,
      "contractPdf.clientSignature",
      "Firma del cliente",
    ),
    investment: tServer(language, "contractPdf.modes.investment", "Inversión"),
    service: tServer(language, "contractPdf.modes.service", "Servicio"),
  };
}

function getPaymentReceiptTexts(language: AppLanguage) {
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
    paidAmount: tServer(
      language,
      "paymentReceipt.paidAmount",
      "Importe abonado",
    ),
    currency: tServer(language, "paymentReceipt.currency", "Moneda"),
    paymentDate: tServer(
      language,
      "paymentReceipt.paymentDate",
      "Fecha de pago",
    ),
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

function getAllowedProposalModes(modalidad: unknown): ProposalMode[] {
  const normalized = normalizeInstallationModalidad(modalidad);

  if (normalized === "inversion") return ["investment"];
  if (normalized === "servicio") return ["service"];
  return ["investment", "service"];
}

function resolveProposalMode(
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

function getProposalModeLabel(
  mode: ProposalMode,
  language: AppLanguage,
): string {
  const texts = getContractTexts(language);
  return mode === "investment" ? texts.investment : texts.service;
}

function getStudyCoordinates(study: any): { lat: number; lng: number } | null {
  const lat =
    toNullableNumber(study?.location?.lat) ??
    toNullableNumber(study?.location?.latitude) ??
    toNullableNumber(study?.customer?.lat) ??
    toNullableNumber(study?.customer?.latitude) ??
    toNullableNumber(study?.invoice_data?.lat) ??
    toNullableNumber(study?.invoice_data?.latitude);

  const lng =
    toNullableNumber(study?.location?.lng) ??
    toNullableNumber(study?.location?.lon) ??
    toNullableNumber(study?.location?.longitude) ??
    toNullableNumber(study?.customer?.lng) ??
    toNullableNumber(study?.customer?.lon) ??
    toNullableNumber(study?.customer?.longitude) ??
    toNullableNumber(study?.invoice_data?.lng) ??
    toNullableNumber(study?.invoice_data?.lon) ??
    toNullableNumber(study?.invoice_data?.longitude);

  if (lat === null || lng === null) return null;

  return { lat, lng };
}
type InstallationStudyCalculationMode = "segun_factura" | "fijo";
type InstallationReservationMode = "segun_potencia" | "fija";

function normalizeInstallationStudyCalculationMode(
  value: unknown,
): InstallationStudyCalculationMode {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalized === "fijo" || normalized === "fixed") {
    return "fijo";
  }

  return "segun_factura";
}

function normalizeInstallationReservationMode(
  value: unknown,
): InstallationReservationMode {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalized === "fija" || normalized === "fijo" || normalized === "fixed") {
    return "fija";
  }

  return "segun_potencia";
}

/**
 * Decide la potencia asignada al estudio:
 * - Si calculo_estudios === "fijo" y potencia_fija_kwp > 0 → usa la fija.
 * - En cualquier otro caso → usa la calculada a partir de la factura.
 */
function resolveAssignedKwpForInstallation(params: {
  installation: any;
  requestedKwp: number;
}) {
  const calculoMode = String(
    params.installation?.calculo_estudios ?? "",
  ).toLowerCase().trim();
  const fixedKwp = Number(params.installation?.potencia_fija_kwp ?? 0);

  if (calculoMode === "fijo" && Number.isFinite(fixedKwp) && fixedKwp > 0) {
    return {
      assignedKwp: fixedKwp,
      source: "fixed" as const,
      calculationMode: "fijo" as const,
    };
  }

  return {
    assignedKwp: params.requestedKwp,
    source: "calculated" as const,
    calculationMode: "segun_factura" as const,
  };
}

function resolveReservationAmountForInstallation(params: {
  installation: any;
  assignedKwp: number;
  fallbackAmount?: unknown;
}) {
  const calculoMode = String(
    params.installation?.calculo_estudios ?? "",
  ).toLowerCase().trim();
  const fixedKwp = toNullableNumber(params.installation?.potencia_fija_kwp) ?? 0;
  const fixedReservationAmount = toPositiveNumber(
    params.installation?.reserva_fija_eur,
  );

  // Solo se usa la reserva fija cuando calculo_estudios === "fijo"
  if (calculoMode === "fijo" && fixedKwp > 0) {
    if (fixedReservationAmount === null) {
      throw new Error(
        "La instalación tiene potencia fija pero no tiene reserva_fija_eur válida",
      );
    }

    return {
      reservationMode: "fija" as const,
      signalAmount: fixedReservationAmount,
      source: "fixed" as const,
    };
  }

  // Si potencia fija es 0, usar el cálculo de siempre
  const fallbackAmount = toPositiveNumber(params.fallbackAmount);

  if (fallbackAmount !== null) {
    return {
      reservationMode: "segun_potencia" as const,
      signalAmount: fallbackAmount,
      source: "fallback" as const,
    };
  }

  throw new Error(
    "No se ha podido determinar el importe de la reserva",
  );
}

function resolveInstallationBankIban(installation: any): string {
  return (
    pickFirstString(
      installation?.iban_aportaciones,
      SAPIENS_BANK_ACCOUNT_IBAN,
    ) ?? SAPIENS_BANK_ACCOUNT_IBAN
  );
}
async function buildPaymentReceiptPdfBuffer(params: {
  contractNumber: string;
  contractId: string;
  reservationId: string;
  installationName: string;
  reservedKwp: number;
  signalAmount: number;
  currency: string;
  stripeSessionId: string;
  stripePaymentIntentId?: string | null;
  paidAt: string;
  clientName: string;
  clientDni: string;
  language: AppLanguage;
}): Promise<Buffer> {
  const pdf = new jsPDF({
    unit: "pt",
    format: "a4",
  });

  const texts = getPaymentReceiptTexts(params.language);
  const locale = getLocaleFromLanguage(params.language);

  const margin = 48;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const usableWidth = pageWidth - margin * 2;
  let y = 56;

  const writeTitle = (text: string) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(22);
    pdf.setTextColor(7, 0, 95);
    pdf.text(text, margin, y);
    y += 26;
  };

  const writeSubtitle = (text: string) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.setTextColor(100, 100, 100);
    pdf.text(text, margin, y);
    y += 22;
  };

  const writeSectionTitle = (text: string) => {
    y += 8;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.setTextColor(7, 0, 95);
    pdf.text(text, margin, y);
    y += 18;
  };

  const writeLine = (label: string, value: string) => {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(40, 40, 40);
    pdf.text(`${label}:`, margin, y);

    pdf.setFont("helvetica", "normal");
    const labelWidth = pdf.getTextWidth(`${label}: `);
    const lines = pdf.splitTextToSize(
      value || "-",
      usableWidth - labelWidth - 6,
    );
    pdf.text(lines, margin + labelWidth + 6, y);

    y += Math.max(lines.length * 14, 18);
  };

  const formatAmount = (amount: number, currency: string) => {
    return formatCurrencyByLanguage(amount, currency, params.language);
  };

  const paymentDate = new Date(params.paidAt).toLocaleString(locale);

  writeTitle(texts.title);
  writeSubtitle(`${texts.precontractLabel} ${params.contractNumber}`);

  writeSectionTitle(texts.holderSection);
  writeLine(texts.client, params.clientName);
  writeLine("DNI", params.clientDni);

  writeSectionTitle(texts.reservationSection);
  writeLine(texts.contractId, params.contractId);
  writeLine(texts.reservationId, params.reservationId);
  writeLine(texts.installation, params.installationName);
  writeLine(texts.reservedPower, `${params.reservedKwp} kWp`);
  writeLine(
    texts.paidAmount,
    formatAmount(params.signalAmount, params.currency),
  );
  writeLine(texts.currency, params.currency.toUpperCase());
  writeLine(texts.paymentDate, paymentDate);

  writeSectionTitle(texts.stripeSection);
  writeLine(texts.checkoutSessionId, params.stripeSessionId);
  writeLine(texts.paymentIntentId, params.stripePaymentIntentId ?? "-");

  y += 18;
  pdf.setDrawColor(220, 224, 230);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 18;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(110, 110, 110);

  const footer = pdf.splitTextToSize(texts.footer, usableWidth);
  pdf.text(footer, margin, y);

  const arrayBuffer = pdf.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}

async function sendReservationConfirmationAfterPayment(params: {
  reservationId: string;
  stripeSessionId: string;
  stripePaymentIntentId?: string | null;
}) {
  const { reservationId, stripeSessionId, stripePaymentIntentId } = params;

  console.log("[payment-email] START", {
    reservationId,
    stripeSessionId,
    stripePaymentIntentId,
  });

  const { data: reservation, error: reservationError } = await supabase
    .from("installation_reservations")
    .select("*")
    .eq("id", reservationId)
    .single();

  if (reservationError || !reservation) {
    console.error("[payment-email] Reserva no encontrada", reservationError);
    throw new Error(
      reservationError?.message ||
        "No se encontró la reserva para enviar el correo",
    );
  }

  console.log("[payment-email] reservation OK", {
    id: reservation.id,
    contract_id: reservation.contract_id,
    signal_amount: reservation.signal_amount,
    currency: reservation.currency,
  });

  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", reservation.contract_id)
    .single();

  if (contractError || !contract) {
    console.error("[payment-email] Contrato no encontrado", contractError);
    throw new Error(
      contractError?.message || "No se encontró el precontrato asociado",
    );
  }

  console.log("[payment-email] contract OK", {
    id: contract.id,
    contract_number: contract.contract_number,
    contract_drive_file_id: contract.contract_drive_file_id,
    study_id: contract.study_id,
  });

  const alreadySentAt =
    (reservation.metadata as any)?.payment_confirmation_email_sent_at ?? null;

  if (alreadySentAt) {
    console.log("[payment-email] Ya enviado anteriormente", alreadySentAt);
    return;
  }

  const ctx = await getContractContextFromStudy(contract.study_id);
  const language = normalizeAppLanguage(ctx.study?.language);

  console.log("[payment-email] client/context OK", {
    clientEmail: ctx.client.email,
    clientName: `${ctx.client.nombre} ${ctx.client.apellidos}`.trim(),
    installationName: ctx.installation.nombre_instalacion,
    language,
  });

  if (!ctx.client.email) {
    throw new Error("El cliente no tiene email");
  }

  if (!contract.contract_drive_file_id) {
    throw new Error("El precontrato no tiene PDF asociado en Drive");
  }

  const precontractFile = await downloadDriveFileAsBuffer(
    contract.contract_drive_file_id,
  );

  console.log("[payment-email] precontract descargado", {
    fileName: precontractFile.fileName,
    mimeType: precontractFile.mimeType,
    size: precontractFile.buffer.length,
  });

  const receiptBuffer = await buildPaymentReceiptPdfBuffer({
    contractNumber: contract.contract_number,
    contractId: contract.id,
    reservationId: reservation.id,
    installationName: ctx.installation.nombre_instalacion,
    reservedKwp: Number(reservation.reserved_kwp ?? 0),
    signalAmount: Number(reservation.signal_amount ?? 0),
    currency: String(reservation.currency || "eur").toUpperCase(),
    stripeSessionId,
    stripePaymentIntentId: stripePaymentIntentId ?? null,
    paidAt: new Date().toISOString(),
    clientName: `${ctx.client.nombre} ${ctx.client.apellidos}`.trim(),
    clientDni: ctx.client.dni,
    language,
  });

  console.log("[payment-email] justificante generado", {
    size: receiptBuffer.length,
    language,
  });

  await sendReservationConfirmedEmail({
    to: ctx.client.email,
    clientName: `${ctx.client.nombre} ${ctx.client.apellidos}`.trim(),
    precontractPdfBuffer: precontractFile.buffer,
    precontractPdfFilename:
      precontractFile.fileName || `PRECONTRATO_${contract.contract_number}.pdf`,
    receiptPdfBuffer: receiptBuffer,
    receiptPdfFilename: `JUSTIFICANTE_PAGO_${contract.contract_number}.pdf`,
    contractNumber: contract.contract_number,
    installationName: ctx.installation.nombre_instalacion,
    reservedKwp: Number(reservation.reserved_kwp ?? 0),
    signalAmount: Number(reservation.signal_amount ?? 0),
    paymentDate: new Date().toISOString(),
    language,
  });

  console.log("[payment-email] EMAIL ENVIADO OK", {
    to: ctx.client.email,
    language,
  });

  const { error: updateReservationError } = await supabase
    .from("installation_reservations")
    .update({
      stripe_checkout_session_id: stripeSessionId,
      stripe_payment_intent_id: stripePaymentIntentId ?? null,
      metadata: {
        ...(reservation.metadata ?? {}),
        payment_confirmation_email_sent_at: new Date().toISOString(),
        payment_confirmation_email_language: language,
      },
    })
    .eq("id", reservation.id);

  if (updateReservationError) {
    console.error(
      "[payment-email] Error actualizando metadata",
      updateReservationError,
    );
    throw new Error(
      `No se pudo marcar el email como enviado: ${updateReservationError.message}`,
    );
  }

  console.log("[payment-email] FIN OK");
}
type InstallationWithAvailability = {
  id: string;
  nombre_instalacion: string;
  direccion: string;
  lat: number;
  lng: number;
  active: boolean;
  potencia_instalada_kwp: number;
  distance_meters: number;
  totalKwp: number;
  reservedKwp: number;
  confirmedKwp: number;
  usedKwp: number;
  availableKwp: number;
  occupancyPercent: number;

  effectiveAssignedKwp: number;
  assignedKwpSource: "fixed" | "calculated";
  calculationMode: "segun_factura" | "fijo";

  calculo_estudios?: string | null;
  potencia_fija_kwp?: number | null;
  reserva?: string | null;
  reserva_fija_eur?: number | null;
  iban_aportaciones?: string | null;
};

type FindEligibleInstallationsResult = {
  study: any;
  coords: { lat: number; lng: number };
  withinRange: InstallationWithAvailability[];
  eligible: InstallationWithAvailability[];
  recommended: InstallationWithAvailability | null;
  reason: "no_installations_in_range" | "no_capacity_in_range" | null;
};

async function findEligibleInstallationsForStudy(params: {
  studyId: string;
  assignedKwp: number;
  radiusMeters?: number;
}): Promise<FindEligibleInstallationsResult> {
  const radiusMeters = params.radiusMeters ?? 5000;

  const { data: study, error: studyError } = await supabase
    .from("studies")
    .select("*")
    .eq("id", params.studyId)
    .single();

  if (studyError || !study) {
    throw new Error("El estudio no existe");
  }

  const coords = getStudyCoordinates(study);

  if (!coords) {
    throw new Error(
      "El estudio no tiene coordenadas válidas para buscar instalaciones cercanas",
    );
  }

  const { data: installations, error: installationsError } = await supabase
    .from("installations")
    .select("*")
    .eq("active", true)
    .order("nombre_instalacion", { ascending: true });

  if (installationsError) {
    throw new Error(
      `No se pudieron obtener las instalaciones: ${installationsError.message}`,
    );
  }

  const withinRange = (installations ?? [])
    .map((installation: any) => {
      const distance_meters = haversineDistanceMeters(
        coords.lat,
        coords.lng,
        Number(installation.lat),
        Number(installation.lng),
      );

      const totalKwp = Number(
        installation.contractable_kwp_total ??
          installation.potencia_instalada_kwp ??
          0,
      );

      const reservedKwp = Number(installation.contractable_kwp_reserved ?? 0);
      const confirmedKwp = Number(installation.contractable_kwp_confirmed ?? 0);
      const usedKwp = reservedKwp + confirmedKwp;
      const availableKwp = Math.max(totalKwp - usedKwp, 0);
      const occupancyPercent =
        totalKwp > 0 ? Number(((usedKwp / totalKwp) * 100).toFixed(2)) : 0;

      const resolvedAssignment = resolveAssignedKwpForInstallation({
        installation,
        requestedKwp: params.assignedKwp,
      });

      return {
        ...installation,
        distance_meters,
        totalKwp,
        reservedKwp,
        confirmedKwp,
        usedKwp,
        availableKwp,
        occupancyPercent,
        effectiveAssignedKwp: resolvedAssignment.assignedKwp,
        assignedKwpSource: resolvedAssignment.source,
        calculationMode: resolvedAssignment.calculationMode,
      };
    })
    .filter((installation) => installation.distance_meters <= radiusMeters)
    .sort((a, b) => a.distance_meters - b.distance_meters);

  if (withinRange.length === 0) {
    return {
      study,
      coords,
      withinRange: [],
      eligible: [],
      recommended: null,
      reason: "no_installations_in_range",
    };
  }

  const eligible = withinRange
    .filter(
      (installation) =>
        installation.availableKwp >= installation.effectiveAssignedKwp,
    )
    .sort((a, b) => {
      if (a.distance_meters !== b.distance_meters) {
        return a.distance_meters - b.distance_meters;
      }

      return a.occupancyPercent - b.occupancyPercent;
    });

  return {
    study,
    coords,
    withinRange,
    eligible,
    recommended: eligible[0] ?? null,
    reason: eligible.length === 0 ? "no_capacity_in_range" : null,
  };
}

async function getInstallationCapacityState(params: {
  installationId: string;
}) {
  const { installationId } = params;

  const { data: installation, error: installationError } = await supabase
    .from("installations")
    .select(
      "id, nombre_instalacion, direccion, lat, lng, potencia_instalada_kwp, contractable_kwp_total, contractable_kwp_reserved, contractable_kwp_confirmed, active, calculo_estudios, potencia_fija_kwp, reserva, reserva_fija_eur, iban_aportaciones",
    )
    .eq("id", installationId)
    .single();

  if (installationError || !installation) {
    throw new Error("La instalación no existe");
  }

  if (!installation.active) {
    throw new Error("La instalación está inactiva");
  }

  const totalKwp = Number(
    (installation as any).contractable_kwp_total ??
      installation.potencia_instalada_kwp ??
      0,
  );

  const reservedKwp = Number(
    (installation as any).contractable_kwp_reserved ?? 0,
  );

  const confirmedKwp = Number(
    (installation as any).contractable_kwp_confirmed ?? 0,
  );

  const usedKwp = reservedKwp + confirmedKwp;
  const availableKwp = Math.max(totalKwp - usedKwp, 0);
  const occupancyPercent =
    totalKwp > 0 ? Number(((usedKwp / totalKwp) * 100).toFixed(2)) : 0;

  return {
    installation,
    totalKwp,
    reservedKwp,
    confirmedKwp,
    usedKwp,
    availableKwp,
    occupancyPercent,
  };
}

async function validateInstallationAssignment(params: {
  installationId: string;
  assignedKwp: number;
}) {
  const state = await getInstallationCapacityState({
    installationId: params.installationId,
  });

  if (params.assignedKwp > state.availableKwp) {
    throw new Error(
      `No hay capacidad suficiente en la instalación. Disponibles: ${state.availableKwp.toFixed(
        2,
      )} kWp`,
    );
  }

  const nextUsedKwp = state.usedKwp + params.assignedKwp;

  return {
    ...state,
    assignedKwp: params.assignedKwp,
    nextUsedKwp,
    nextAvailableKwp: Math.max(state.totalKwp - nextUsedKwp, 0),
    nextOccupancyPercent:
      state.totalKwp > 0
        ? Number(((nextUsedKwp / state.totalKwp) * 100).toFixed(2))
        : 0,
  };
}

function buildInstallationSnapshot(params: {
  installation: {
    id: string;
    nombre_instalacion: string;
    potencia_instalada_kwp: number;
    active?: boolean;
  };
  assignedKwp: number;
  totalKwp: number;
  reservedKwp?: number;
  confirmedKwp?: number;
  usedKwp: number;
  availableKwp: number;
  occupancyPercent: number;
}) {
  return {
    installationId: params.installation.id,
    installationName: params.installation.nombre_instalacion,
    installationData: {
      id: params.installation.id,
      nombre_instalacion: params.installation.nombre_instalacion,
      potencia_instalada_kwp: params.totalKwp,
      active: params.installation.active ?? true,
    },
    assigned_kwp: params.assignedKwp,
    occupancy: {
      total_kwp: params.totalKwp,
      reserved_kwp: params.reservedKwp ?? null,
      confirmed_kwp: params.confirmedKwp ?? null,
      used_kwp: params.usedKwp,
      available_kwp: params.availableKwp,
      occupancy_percent: params.occupancyPercent,
    },
    updated_at: new Date().toISOString(),
  };
}
function toNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "1", "yes", "si", "sí"].includes(value.toLowerCase());
  }
  return false;
}

function parseMaybeJson<T = any>(value: unknown): T | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object") return value as T;
  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
function toPositiveNumber(value: unknown): number | null {
  const parsed = toNullableNumber(value);
  if (parsed === null) return null;
  return parsed > 0 ? parsed : null;
}

async function downloadDriveFileAsBuffer(fileId: string) {
  const metadata = await drive.files.get({
    fileId,
    fields: "id,name,mimeType",
    supportsAllDrives: true,
  });

  const response = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true,
    },
    {
      responseType: "arraybuffer",
    },
  );

  const fileData = response.data;

  let buffer: Buffer;

  if (Buffer.isBuffer(fileData)) {
    buffer = fileData;
  } else if (fileData instanceof ArrayBuffer) {
    buffer = Buffer.from(fileData);
  } else if (typeof fileData === "string") {
    buffer = Buffer.from(fileData);
  } else {
    buffer = Buffer.from(fileData as any);
  }

  return {
    buffer,
    fileName: metadata.data.name ?? "propuesta.pdf",
    mimeType: metadata.data.mimeType ?? "application/pdf",
  };
}

function getPeriodPrice(
  reqBody: any,
  invoiceData: any,
  period: "p1" | "p2" | "p3" | "p4" | "p5" | "p6",
): number | null {
  return (
    toNullableNumber(reqBody?.[`precio_${period}_eur_kwh`]) ??
    toNullableNumber(invoiceData?.[`precio_${period}_eur_kwh`]) ??
    toNullableNumber(invoiceData?.prices?.[period]) ??
    toNullableNumber(invoiceData?.energy_prices?.[period]) ??
    toNullableNumber(invoiceData?.period_prices?.[period]) ??
    toNullableNumber(invoiceData?.coste_eur_kwh?.[period]) ??
    null
  );
}

async function ensureClientDriveFolder(params: {
  dni: string;
  nombre: string;
  apellidos: string;
}) {
  const folderName = buildClientFolderName(
    params.dni,
    params.nombre,
    params.apellidos,
  );

  const q = [
    `mimeType='application/vnd.google-apps.folder'`,
    `trashed=false`,
    `name='${escapeDriveQueryValue(folderName)}'`,
    `'${GOOGLE_DRIVE_ROOT_FOLDER_ID}' in parents`,
  ].join(" and ");

  const existing = await drive.files.list({
    q,
    pageSize: 1,
    fields: "files(id,name,webViewLink)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const found = existing.data.files?.[0];

  if (found?.id) {
    return {
      id: found.id,
      name: found.name ?? folderName,
      webViewLink:
        found.webViewLink ??
        `https://drive.google.com/drive/folders/${found.id}`,
    };
  }

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [GOOGLE_DRIVE_ROOT_FOLDER_ID],
    },
    fields: "id,name,webViewLink",
    supportsAllDrives: true,
  });

  if (!created.data.id) {
    throw new Error("No se pudo crear la carpeta del cliente en Drive");
  }

  return {
    id: created.data.id,
    name: created.data.name ?? folderName,
    webViewLink:
      created.data.webViewLink ??
      `https://drive.google.com/drive/folders/${created.data.id}`,
  };
}

async function uploadBufferToDrive(params: {
  folderId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const uploaded = await drive.files.create({
    requestBody: {
      name: params.fileName,
      parents: [params.folderId],
    },
    media: {
      mimeType: params.mimeType,
      body: Readable.from(params.buffer),
    },
    fields: "id,name,webViewLink,webContentLink",
    supportsAllDrives: true,
  });

  if (!uploaded.data.id) {
    throw new Error("No se pudo subir el archivo a Google Drive");
  }

  return {
    id: uploaded.data.id,
    name: uploaded.data.name ?? params.fileName,
    webViewLink:
      uploaded.data.webViewLink ??
      `https://drive.google.com/file/d/${uploaded.data.id}/view`,
    webContentLink: uploaded.data.webContentLink ?? null,
  };
}

type ContractFolderStatus = "PendientesPago" | "Confirmados" | "Expirados";

function buildContractNumber(studyId: string) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `CT-${date}-${studyId.slice(0, 8).toUpperCase()}`;
}

function buildContractFileName(params: {
  dni: string;
  nombre: string;
  apellidos: string;
  contractId: string;
}) {
  const date = new Date().toISOString().slice(0, 10);

  return `${normalizeDriveToken(params.dni)}-${normalizeDriveToken(
    params.nombre,
  )}_${normalizeDriveToken(params.apellidos)}-${date}-${params.contractId.slice(
    0,
    8,
  )}.pdf`;
}

async function ensureDriveChildFolder(parentId: string, folderName: string) {
  const q = [
    `mimeType='application/vnd.google-apps.folder'`,
    `trashed=false`,
    `name='${escapeDriveQueryValue(folderName)}'`,
    `'${parentId}' in parents`,
  ].join(" and ");

  const existing = await drive.files.list({
    q,
    pageSize: 1,
    fields: "files(id,name,webViewLink)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const found = existing.data.files?.[0];

  if (found?.id) {
    return {
      id: found.id,
      name: found.name ?? folderName,
      webViewLink:
        found.webViewLink ??
        `https://drive.google.com/drive/folders/${found.id}`,
    };
  }

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id,name,webViewLink",
    supportsAllDrives: true,
  });

  if (!created.data.id) {
    throw new Error(`No se pudo crear la carpeta ${folderName} en Drive`);
  }

  return {
    id: created.data.id,
    name: created.data.name ?? folderName,
    webViewLink:
      created.data.webViewLink ??
      `https://drive.google.com/drive/folders/${created.data.id}`,
  };
}

async function ensureContractsStatusFolder(status: ContractFolderStatus) {
  const contractsRoot = await ensureDriveChildFolder(
    GOOGLE_DRIVE_ROOT_FOLDER_ID,
    "CONTRATOS",
  );

  const statusFolder = await ensureDriveChildFolder(contractsRoot.id, status);

  return {
    root: contractsRoot,
    folder: statusFolder,
  };
}

async function getContractContextFromStudy(studyId: string) {
  const { data: study, error: studyError } = await supabase
    .from("studies")
    .select("*")
    .eq("id", studyId)
    .single();

  if (studyError || !study) {
    throw new Error("El estudio no existe");
  }

  const customer = study.customer ?? {};
  const clientDni =
    pickFirstString(customer?.dni, customer?.documentNumber) ?? null;

  if (!clientDni) {
    throw new Error("El estudio no tiene DNI de cliente");
  }

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("dni", clientDni)
    .single();

  if (clientError || !client) {
    throw new Error("No se encontró el cliente asociado al estudio");
  }

  const installationId = study.selected_installation_id ?? null;

  if (!installationId) {
    throw new Error("El estudio no tiene instalación asignada");
  }

  const { data: installation, error: installationError } = await supabase
    .from("installations")
    .select("*")
    .eq("id", installationId)
    .single();

  if (installationError || !installation) {
    throw new Error("La instalación asociada al estudio no existe");
  }

  const assignedKwp =
    toPositiveNumber(study.assigned_kwp) ??
    toPositiveNumber(study?.calculation?.recommendedPowerKwp) ??
    toPositiveNumber(study?.selected_installation_snapshot?.assigned_kwp);

  if (assignedKwp === null) {
    throw new Error("El estudio no tiene assigned_kwp válido");
  }

  const language = normalizeAppLanguage(study.language);

  return {
    study,
    client,
    installation,
    assignedKwp,
    language,
  };
}
function buildBasicContractHtml(params: {
  contractId: string;
  contractNumber: string;
  proposalMode: "investment" | "service";
  client: any;
  study: any;
  installation: any;
  assignedKwp: number;
  language: AppLanguage;
}) {
  const texts = getContractTexts(params.language);
  const fullName = `${params.client.nombre} ${params.client.apellidos}`.trim();
  const signedDate = new Date().toLocaleDateString(
    getLocaleFromLanguage(params.language),
  );

  return `
    <!doctype html>
    <html lang="${texts.htmlLang}">
      <head>
        <meta charset="UTF-8" />
<title>${texts.title} ${params.contractNumber}</title>        <style>
          body {
            font-family: Arial, sans-serif;
            color: #111827;
            padding: 40px;
            line-height: 1.6;
          }
          .title {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 8px;
            color: #07005f;
          }
          .subtitle {
            font-size: 14px;
            color: #6b7280;
            margin-bottom: 32px;
          }
          .box {
            border: 1px solid #e5e7eb;
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 20px;
          }
          .box h3 {
            margin: 0 0 12px 0;
            color: #07005f;
          }
          .signature {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px dashed #9ca3af;
          }
        </style>
      </head>
      <body>
        <div class="title">${texts.title}</div>
        <div class="subtitle">${texts.contractNumber} ${
          params.contractNumber
        } · ${texts.date} ${signedDate}</div>

        <div class="box">
          <h3>${texts.clientData}</h3>
          <p><strong>${texts.name}:</strong> ${fullName}</p>
          <p><strong>${texts.dni}:</strong> ${params.client.dni}</p>
          <p><strong>${texts.email}:</strong> ${params.client.email ?? "-"}</p>
          <p><strong>${texts.phone}:</strong> ${params.client.telefono ?? "-"}</p>
          <p><strong>${texts.address}:</strong> ${
            params.client.direccion_completa ?? "-"
          }</p>
        </div>

        <div class="box">
          <h3>${texts.installationData}</h3>
          <p><strong>${texts.installation}:</strong> ${
            params.installation.nombre_instalacion
          }</p>
          <p><strong>${texts.address}:</strong> ${params.installation.direccion}</p>
          <p><strong>${texts.mode}:</strong> ${getProposalModeLabel(
            params.proposalMode,
            params.language,
          )}</p>
          <p><strong>${texts.assignedKwp}:</strong> ${params.assignedKwp}</p>
        </div>

        <div class="box">
          <h3>${texts.basicConditions}</h3>
          <p>${texts.condition1}</p>
          <p>${texts.condition2}</p>
          <p>${texts.condition3}</p>
        </div>

        <div class="signature">
          <p><strong>${texts.clientSignature}:</strong></p>
          <div style="height: 80px;"></div>
        </div>
      </body>
    </html>
  `;
}

const driveAuth = new google.auth.JWT({
  email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
  key: GOOGLE_PRIVATE_KEY,
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({
  version: "v3",
  auth: driveAuth,
});

function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371000;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function normalizeAddressForGeocoding(address: string): string {
  return address
    .replace(/\s+/g, " ")
    .replace(/,+/g, ",")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

/**
 * Error tipado para el geocoding. El código `reason` es una de las etiquetas
 * de abajo y se propaga al front a través de `/api/geocode-address` para que
 * pueda mostrar un mensaje específico al usuario.
 */
type GeocodeErrorReason =
  | "invalid_request"
  | "zero_results"
  | "quota_exceeded"
  | "daily_limit"
  | "request_denied"
  | "network_timeout"
  | "network_error"
  | "upstream_error";

class GeocodeError extends Error {
  reason: GeocodeErrorReason;
  status: number;
  constructor(reason: GeocodeErrorReason, message: string, status = 502) {
    super(message);
    this.reason = reason;
    this.status = status;
  }
}

// Cache en memoria para geocoding. Clave: sha256(dirección normalizada).
// TTL corto porque las direcciones de los clientes son muy estables pero no
// queremos acumular datos personales indefinidamente.
const GEOCODE_CACHE_TTL_MS = Number(
  process.env.GEOCODE_CACHE_TTL_MS || 30 * 60 * 1000, // 30 min
);
const GEOCODE_CACHE_MAX_ENTRIES = Number(
  process.env.GEOCODE_CACHE_MAX_ENTRIES || 200,
);
type GeocodeCacheEntry = {
  data: {
    lat: number;
    lng: number;
    formattedAddress: string | null;
    placeId: string | null;
  };
  ts: number;
};
const geocodeCache = new Map<string, GeocodeCacheEntry>();

function geocodeCacheGet(key: string): GeocodeCacheEntry["data"] | null {
  const entry = geocodeCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > GEOCODE_CACHE_TTL_MS) {
    geocodeCache.delete(key);
    return null;
  }
  return entry.data;
}

function geocodeCacheSet(key: string, data: GeocodeCacheEntry["data"]): void {
  if (geocodeCache.size >= GEOCODE_CACHE_MAX_ENTRIES) {
    const oldestKey = geocodeCache.keys().next().value;
    if (oldestKey) geocodeCache.delete(oldestKey);
  }
  geocodeCache.set(key, { data, ts: Date.now() });
}

// Intentos y timeout para llamadas a Google.
const GEOCODE_MAX_ATTEMPTS = Number(process.env.GEOCODE_MAX_ATTEMPTS || 3);
const GEOCODE_TIMEOUT_MS = Number(process.env.GEOCODE_TIMEOUT_MS || 8000);
const GEOCODE_RETRY_BASE_MS = Number(process.env.GEOCODE_RETRY_BASE_MS || 400);

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeAddressWithGoogle(address: string): Promise<{
  lat: number;
  lng: number;
  formattedAddress: string | null;
  placeId: string | null;
} | null> {
  const normalizedAddress = normalizeAddressForGeocoding(address);

  if (!normalizedAddress) return null;

  // Cache HIT
  const cacheKey = crypto
    .createHash("sha256")
    .update(normalizedAddress.toLowerCase())
    .digest("hex");
  const cached = geocodeCacheGet(cacheKey);
  if (cached) {
    console.log(
      `[geocode] cache HIT para "${normalizedAddress.slice(0, 60)}"`,
    );
    return cached;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", normalizedAddress);
  url.searchParams.set("region", "es");
  url.searchParams.set("language", "es");
  url.searchParams.set("components", "country:ES");
  url.searchParams.set("key", GOOGLE_MAPS_GEOCODING_API_KEY);

  let lastError: any = null;

  for (let attempt = 1; attempt <= GEOCODE_MAX_ATTEMPTS; attempt++) {
    const abortCtrl = new AbortController();
    const timeoutHandle = setTimeout(
      () => abortCtrl.abort(),
      GEOCODE_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: abortCtrl.signal,
      });
      clearTimeout(timeoutHandle);

      if (!response.ok) {
        // HTTP 5xx de Google → transitorio, reintento
        if (response.status >= 500 && attempt < GEOCODE_MAX_ATTEMPTS) {
          lastError = new GeocodeError(
            "upstream_error",
            `Google devolvió ${response.status}`,
            502,
          );
          await sleepMs(GEOCODE_RETRY_BASE_MS * 2 ** (attempt - 1));
          continue;
        }
        throw new GeocodeError(
          "upstream_error",
          `Google devolvió ${response.status}`,
          502,
        );
      }

      const json = await response.json();

      switch (json.status) {
        case "OK": {
          const first = json.results?.[0];
          const lat = Number(first?.geometry?.location?.lat);
          const lng = Number(first?.geometry?.location?.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            throw new GeocodeError(
              "upstream_error",
              "Google devolvió OK pero sin coordenadas válidas",
              502,
            );
          }

          // Filtro contra resultados demasiado vagos.
          // Con `components=country:ES`, si la dirección no existe Google
          // hace fallback al centroide del país/provincia/ciudad y devuelve
          // OK. Esto es peligroso porque pondría al cliente en un punto
          // aleatorio. Rechazamos resultados cuyos `types` son entidades
          // administrativas y no tienen granularidad de calle o similar.
          const resultTypes: string[] = Array.isArray(first?.types)
            ? first.types
            : [];
          const TOO_GENERIC_TYPES = new Set([
            "country",
            "administrative_area_level_1",
            "administrative_area_level_2",
            "administrative_area_level_3",
            "administrative_area_level_4",
            "political",
          ]);
          const hasGranular = resultTypes.some((t) =>
            [
              "street_address",
              "premise",
              "subpremise",
              "route",
              "intersection",
              "point_of_interest",
              "establishment",
              "postal_code",
              "plus_code",
            ].includes(t),
          );
          const isOnlyGeneric =
            resultTypes.length > 0 &&
            resultTypes.every((t) => TOO_GENERIC_TYPES.has(t)) &&
            !hasGranular;

          if (isOnlyGeneric) {
            console.warn(
              `[geocode] Resultado demasiado genérico para "${normalizedAddress.slice(0, 80)}" → tipos=[${resultTypes.join(",")}]. Tratando como ZERO_RESULTS.`,
            );
            return null;
          }

          // También rechazamos los partial_match que solo matchean la ciudad.
          // partial_match=true + sin street_number = probablemente demasiado ambiguo.
          if (
            first?.partial_match === true &&
            !resultTypes.includes("street_address") &&
            !resultTypes.includes("premise") &&
            !resultTypes.includes("subpremise") &&
            !resultTypes.includes("route")
          ) {
            console.warn(
              `[geocode] Partial match sin granularidad para "${normalizedAddress.slice(0, 80)}" → tipos=[${resultTypes.join(",")}]. Tratando como ZERO_RESULTS.`,
            );
            return null;
          }

          const result = {
            lat,
            lng,
            formattedAddress: first?.formatted_address ?? null,
            placeId: first?.place_id ?? null,
          };
          geocodeCacheSet(cacheKey, result);
          return result;
        }

        case "ZERO_RESULTS":
          // La dirección es sintácticamente válida pero Google no la encuentra.
          // No es reintentable — devolvemos null para que el flujo decida.
          return null;

        case "OVER_QUERY_LIMIT":
          throw new GeocodeError(
            "quota_exceeded",
            "Hemos alcanzado el límite de peticiones a Google Maps.",
            429,
          );

        case "OVER_DAILY_LIMIT":
          throw new GeocodeError(
            "daily_limit",
            "La cuota diaria de Google Maps está agotada.",
            429,
          );

        case "REQUEST_DENIED":
          // Típicamente API key inválida, sin facturación o sin Geocoding habilitado.
          console.error(
            "[geocode] REQUEST_DENIED de Google:",
            json.error_message,
          );
          throw new GeocodeError(
            "request_denied",
            json.error_message ||
              "Google rechazó la petición (API key inválida o sin permisos).",
            500,
          );

        case "INVALID_REQUEST":
          throw new GeocodeError(
            "invalid_request",
            json.error_message || "Petición inválida a Google Maps.",
            400,
          );

        case "UNKNOWN_ERROR":
          // Transitorio según Google → reintentar
          lastError = new GeocodeError(
            "upstream_error",
            json.error_message || "Error desconocido de Google Maps.",
            502,
          );
          if (attempt < GEOCODE_MAX_ATTEMPTS) {
            await sleepMs(GEOCODE_RETRY_BASE_MS * 2 ** (attempt - 1));
            continue;
          }
          throw lastError;

        default:
          throw new GeocodeError(
            "upstream_error",
            `Status inesperado de Google: ${json.status}`,
            502,
          );
      }
    } catch (error: any) {
      clearTimeout(timeoutHandle);

      // Si ya es un GeocodeError, déjalo pasar tal cual.
      if (error instanceof GeocodeError) throw error;

      // Timeout por AbortController
      if (error?.name === "AbortError") {
        lastError = new GeocodeError(
          "network_timeout",
          `Timeout al llamar a Google Maps (${GEOCODE_TIMEOUT_MS}ms)`,
          504,
        );
        if (attempt < GEOCODE_MAX_ATTEMPTS) {
          await sleepMs(GEOCODE_RETRY_BASE_MS * 2 ** (attempt - 1));
          continue;
        }
        throw lastError;
      }

      // Errores de red (ECONNRESET, ENOTFOUND, fetch failed…) → reintentar
      lastError = new GeocodeError(
        "network_error",
        `Error de red al llamar a Google Maps: ${error?.message || "desconocido"}`,
        502,
      );
      if (attempt < GEOCODE_MAX_ATTEMPTS) {
        await sleepMs(GEOCODE_RETRY_BASE_MS * 2 ** (attempt - 1));
        continue;
      }
      throw lastError;
    }
  }

  // Por si se escapa del loop sin return (no debería)
  throw lastError ?? new GeocodeError("upstream_error", "Geocoding falló tras reintentos");
}

function normalizeIdentityText(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeDni(value: string): string {
  return (value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function generatePlainAccessToken(size = 32): string {
  return crypto.randomBytes(size).toString("base64url");
}

function buildContinueContractUrl(plainToken: string, language: AppLanguage = "es") {
  return `${FRONTEND_URL.replace(
    /\/$/,
    "",
  )}/continuar-contratacion?token=${encodeURIComponent(plainToken)}&lang=${encodeURIComponent(language)}`;
}

// async function createProposalContinueAccessToken(params: {
//   studyId: string;
//   clientId: string;
//   expiresInDays?: number;
// }) {
//   const { studyId, clientId, expiresInDays = 15 } = params;

//   const plainToken = generatePlainAccessToken(32);
//   const tokenHash = sha256(plainToken);
//   const expiresAt = new Date(
//     Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
//   ).toISOString();

//   // Revocamos tokens anteriores vivos para este mismo flujo
//   await supabase
//     .from("contract_access_tokens")
//     .update({
//       revoked_at: new Date().toISOString(),
//     })
//     .eq("study_id", studyId)
//     .eq("client_id", clientId)
//     .eq("purpose", "proposal_continue")
//     .is("used_at", null)
//     .is("revoked_at", null);

//   const { error } = await supabase.from("contract_access_tokens").insert({
//     study_id: studyId,
//     contract_id: null,
//     client_id: clientId,
//     token_hash: tokenHash,
//     purpose: "proposal_continue",
//     expires_at: expiresAt,
//     used_at: null,
//     revoked_at: null,
//   });

//   if (error) {
//     throw new Error(
//       `No se pudo crear el token de acceso al contrato: ${error.message}`,
//     );
//   }

// return {
//   plainToken,
//   expiresAt,
//   continueUrl: buildContinueContractUrl(plainToken, appLanguage),
// };
// }

async function createProposalContinueAccessToken(params: {
  studyId: string;
  clientId: string;
  language?: unknown;
  expiresInDays?: number;
}) {
  const { studyId, clientId, language, expiresInDays = 15 } = params;

  const appLanguage = normalizeAppLanguage(language);

  const plainToken = generatePlainAccessToken(32);
  const tokenHash = sha256(plainToken);
  const expiresAt = new Date(
    Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  await supabase
    .from("contract_access_tokens")
    .update({
      revoked_at: new Date().toISOString(),
    })
    .eq("study_id", studyId)
    .eq("client_id", clientId)
    .eq("purpose", "proposal_continue")
    .is("used_at", null)
    .is("revoked_at", null);

  const { error } = await supabase.from("contract_access_tokens").insert({
    study_id: studyId,
    contract_id: null,
    client_id: clientId,
    token_hash: tokenHash,
    purpose: "proposal_continue",
    expires_at: expiresAt,
    used_at: null,
    revoked_at: null,
  });

  if (error) {
    throw new Error(
      `No se pudo crear el token de acceso al contrato: ${error.message}`,
    );
  }

  return {
    plainToken,
    expiresAt,
    continueUrl: buildContinueContractUrl(plainToken, appLanguage),
  };
}


function signContractResumeToken(payload: {
  studyId: string;
  clientId: string;
  installationId: string;
}) {
  return jwt.sign(payload, CONTRACT_RESUME_JWT_SECRET, {
    expiresIn: "30m",
  });
}

function verifyContractResumeToken(token: string): {
  studyId: string;
  clientId: string;
  installationId: string;
  iat: number;
  exp: number;
} {
  return jwt.verify(token, CONTRACT_RESUME_JWT_SECRET) as {
    studyId: string;
    clientId: string;
    installationId: string;
    iat: number;
    exp: number;
  };
}

function buildReservationSuccessUrl(params: {
  contractId: string;
  reservationId: string;
}) {
  const base = FRONTEND_URL.replace(/\/$/, "");

  return (
    `${base}/reserva-confirmada` +
    `?session_id={CHECKOUT_SESSION_ID}` +
    `&contractId=${encodeURIComponent(params.contractId)}` +
    `&reservationId=${encodeURIComponent(params.reservationId)}`
  );
}

function buildReservationCancelUrl(contractId: string) {
  return `${FRONTEND_URL.replace(
    /\/$/,
    "",
  )}/continuar-contratacion/cancelado?contractId=${encodeURIComponent(
    contractId,
  )}`;
}

function getStripeSessionExpiresAt(paymentDeadlineAt?: string | null) {
  const maxMs = Date.now() + 23 * 60 * 60 * 1000;

  if (!paymentDeadlineAt) {
    return Math.floor(maxMs / 1000);
  }

  const deadlineMs = new Date(paymentDeadlineAt).getTime();
  const finalMs = Math.min(deadlineMs, maxMs);

  return Math.floor(finalMs / 1000);
}

async function createCheckoutSessionForReservation(params: {
  reservationId: string;
  contractId: string;
  studyId: string;
  clientId: string;
  installationId: string;
  installationName: string;
  clientEmail?: string | null;
  signalAmount: number;
  currency: string;
  paymentDeadlineAt?: string | null;
}) {
  const unitAmount = Math.round(params.signalAmount * 100);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: params.reservationId,
    customer_email: params.clientEmail || undefined,
    success_url: buildReservationSuccessUrl({
      contractId: params.contractId,
      reservationId: params.reservationId,
    }),
    cancel_url: buildReservationCancelUrl(params.contractId),
    expires_at: getStripeSessionExpiresAt(params.paymentDeadlineAt),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: params.currency.toLowerCase(),
          unit_amount: unitAmount,
          product_data: {
            name: `Señal de reserva - ${params.installationName}`,
            description: `Precontrato ${params.contractId}`,
          },
        },
      },
    ],
    payment_intent_data: {
      receipt_email: params.clientEmail || undefined,
      metadata: {
        reservationId: params.reservationId,
        contractId: params.contractId,
        studyId: params.studyId,
        clientId: params.clientId,
        installationId: params.installationId,
      },
    },
    metadata: {
      reservationId: params.reservationId,
      contractId: params.contractId,
      studyId: params.studyId,
      clientId: params.clientId,
      installationId: params.installationId,
    },
  });

  if (!session.url) {
    throw new Error("Stripe no devolvió checkoutUrl");
  }

  return session;
}

async function startServer() {
  const app = express();

  app.use(cors());
  // app.use('/assets', express.static(path.join(__dirname, 'assets')));

  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      console.log("[stripe webhook] HIT");
      let event: Stripe.Event;

      try {
        const signature = req.headers["stripe-signature"];

        if (!signature || Array.isArray(signature)) {
          return res.status(400).send("Falta Stripe-Signature");
        }

        event = stripe.webhooks.constructEvent(
          req.body,
          signature,
          STRIPE_WEBHOOK_SECRET,
        );
      } catch (error: any) {
        console.error("Error verificando webhook de Stripe:", error);
        return res.status(400).send(`Webhook Error: ${error.message}`);
      }

      try {
        switch (event.type) {
          case "checkout.session.completed":
          case "checkout.session.async_payment_succeeded": {
            const session = event.data.object as Stripe.Checkout.Session;

            const reservationId =
              String(session.client_reference_id || "") ||
              String(session.metadata?.reservationId || "");

            if (!reservationId) {
              console.log(
                "[stripe webhook] sesión sin reservationId",
                session.id,
              );
              return res.json({ received: true });
            }

            const paymentIntentId =
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : session.payment_intent?.id || null;

            console.log("[stripe webhook] pago completado", {
              sessionId: session.id,
              reservationId,
              paymentIntentId,
            });

            const { error } = await supabase.rpc(
              "confirm_installation_reservation_payment",
              {
                p_reservation_id: reservationId,
                p_stripe_checkout_session_id: session.id,
                p_stripe_payment_intent_id: paymentIntentId,
              },
            );

            if (error) {
              console.error(
                "[stripe webhook] error confirmando reserva",
                error,
              );
              throw new Error(error.message);
            }

            try {
              await sendReservationConfirmationAfterPayment({
                reservationId,
                stripeSessionId: session.id,
                stripePaymentIntentId: paymentIntentId,
              });
            } catch (mailError) {
              console.error(
                "[stripe webhook] pago confirmado pero falló el email de confirmación:",
                mailError,
              );
              throw mailError;
            }

            break;
          }

          case "checkout.session.expired":
          case "checkout.session.async_payment_failed": {
            const session = event.data.object as Stripe.Checkout.Session;

            const reservationId =
              String(session.client_reference_id || "") ||
              String(session.metadata?.reservationId || "");

            if (!reservationId) {
              return res.json({ received: true });
            }

            const paymentStatus =
              event.type === "checkout.session.expired" ? "expired" : "failed";

            const { error } = await supabase.rpc(
              "release_installation_reservation",
              {
                p_reservation_id: reservationId,
                p_release_reason: `stripe_${event.type}`,
                p_payment_status: paymentStatus,
              },
            );

            if (error) {
              throw new Error(error.message);
            }

            break;
          }

          default:
            break;
        }

        return res.json({ received: true });
      } catch (error: any) {
        console.error("Error procesando webhook de Stripe:", error);
        return res.status(500).json({
          error: "No se pudo procesar el webhook de Stripe",
          details: error?.message || "Error desconocido",
        });
      }
    },
  );

  app.use(express.json({ limit: "10mb" }));

  // app.use("/assets", express.static(path.join(process.cwd(), "src", "assets")));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 15 * 1024 * 1024,
    },
  });

  // =========================
  // HEALTH
  // =========================

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // =========================
  // EXTRACTION API
  // =========================

  // Cache en memoria para evitar reextracciones del mismo PDF.
  // Clave: sha256 del buffer. TTL configurable vía env.
  const EXTRACTION_CACHE_TTL_MS = Number(
    process.env.EXTRACTION_CACHE_TTL_MS || 30 * 60 * 1000, // 30 min
  );
  const EXTRACTION_CACHE_MAX_ENTRIES = Number(
    process.env.EXTRACTION_CACHE_MAX_ENTRIES || 100,
  );

  type ExtractionCacheEntry = { data: any; ts: number };
  const extractionCache = new Map<string, ExtractionCacheEntry>();

  function extractionCacheGet(key: string): any | null {
    const entry = extractionCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > EXTRACTION_CACHE_TTL_MS) {
      extractionCache.delete(key);
      return null;
    }
    return entry.data;
  }

  function extractionCacheSet(key: string, data: any): void {
    // LRU pobre: si nos pasamos del límite, tiramos la entrada más antigua.
    if (extractionCache.size >= EXTRACTION_CACHE_MAX_ENTRIES) {
      const oldestKey = extractionCache.keys().next().value;
      if (oldestKey) extractionCache.delete(oldestKey);
    }
    extractionCache.set(key, { data, ts: Date.now() });
  }

  app.post("/api/extract-bill", upload.single("file"), async (req, res) => {
    try {
      const uploadedFile = req.file;

      if (!uploadedFile) {
        return res.status(400).json({
          error: "No se ha recibido ningún archivo",
        });
      }

      const allowedMimeTypes = [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
      ];

      if (!allowedMimeTypes.includes(uploadedFile.mimetype)) {
        return res.status(400).json({
          error: "Tipo de archivo no soportado",
          details: `MIME recibido: ${uploadedFile.mimetype}`,
        });
      }

      const cacheKey = crypto
        .createHash("sha256")
        .update(uploadedFile.buffer)
        .digest("hex");

      const cached = extractionCacheGet(cacheKey);
      if (cached) {
        console.log(
          `[extract-bill] cache HIT para ${uploadedFile.originalname} (${cacheKey.slice(0, 12)}…)`,
        );
        return res.json(cached);
      }

      const result = await extractInvoiceWithFallback({
        buffer: uploadedFile.buffer,
        mimeType: uploadedFile.mimetype,
        fileName: uploadedFile.originalname,
      });

      extractionCacheSet(cacheKey, result);

      return res.json(result);
    } catch (error: any) {
      // Log completo (incluida la cause si la hay) para que se pueda
      // diagnosticar exactamente qué falló (schema, cuota, red, etc.).
      console.error("Error en /api/extract-bill:", error);
      if (error?.cause) {
        console.error("  causa:", error.cause);
      }

      const message = error?.message || "Error desconocido";
      const isQuota = /quota|RESOURCE_EXHAUSTED|429/i.test(message);

      return res.status(isQuota ? 429 : 500).json({
        error: isQuota
          ? "Hemos alcanzado el límite de uso de la IA. Inténtalo de nuevo en unos minutos."
          : "No se pudo extraer la información de la factura",
        details: message,
      });
    }
  });

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
              ) ?? rawAddress ?? null,
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

      let finalSelectedInstallationSnapshot = selectedInstallationSnapshot ?? null;

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
            error: "No hay capacidad suficiente en la instalación seleccionada",
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
            calculo_estudios: capacityState.installation.calculo_estudios ?? null,
            potencia_fija_kwp: capacityState.installation.potencia_fija_kwp ?? null,
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

  app.get("/api/stripe/checkout-session-status", async (req, res) => {
    try {
      const sessionId = String(req.query.session_id || "").trim();

      if (!sessionId) {
        return res.status(400).json({
          error: "Falta session_id",
        });
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const reservationId =
        String(session.client_reference_id || "") ||
        String(session.metadata?.reservationId || "");

      const contractId =
        String(session.metadata?.contractId || "") ||
        String(req.query.contractId || "");

      let reservation: any = null;
      let contract: any = null;

      if (reservationId) {
        const { data, error } = await supabase
          .from("installation_reservations")
          .select("*")
          .eq("id", reservationId)
          .maybeSingle();

        if (error) {
          return res.status(500).json({
            error: "No se pudo consultar la reserva",
            details: error.message,
          });
        }

        reservation = data;
      }

      const effectiveContractId =
        reservation?.contract_id ?? contractId ?? null;

      if (effectiveContractId) {
        const { data, error } = await supabase
          .from("contracts")
          .select("id, contract_number, status, contract_drive_url")
          .eq("id", effectiveContractId)
          .maybeSingle();

        if (error) {
          return res.status(500).json({
            error: "No se pudo consultar el contrato",
            details: error.message,
          });
        }

        contract = data;
      }

      const waitingWebhook =
        session.status === "complete" && reservation?.payment_status !== "paid";

      return res.json({
        success: true,
        session: {
          id: session.id,
          status: session.status,
          paymentStatus: session.payment_status,
          customerEmail: session.customer_email ?? null,
        },
        reservation: reservation
          ? {
              id: reservation.id,
              contractId: reservation.contract_id,
              reservationStatus: reservation.reservation_status,
              paymentStatus: reservation.payment_status,
              paymentDeadlineAt: reservation.payment_deadline_at,
              confirmedAt: reservation.confirmed_at,
              releasedAt: reservation.released_at,
              signalAmount: reservation.signal_amount,
              currency: reservation.currency,
            }
          : null,
        contract: contract
          ? {
              id: contract.id,
              contractNumber: contract.contract_number,
              status: contract.status,
              contractUrl: contract.contract_drive_url ?? null,
            }
          : null,
        waitingWebhook,
      });
    } catch (error: any) {
      console.error("Error en /api/stripe/checkout-session-status:", error);

      return res.status(500).json({
        error: "No se pudo consultar el estado de la sesión de Stripe",
        details: error?.message || "Error desconocido",
      });
    }
  });

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

  app.post("/api/geocode-address", async (req, res) => {
    try {
      const address = String(req.body?.address || "").trim();

      if (!address) {
        return res.status(400).json({
          error: "La dirección es obligatoria",
          reason: "invalid_request",
        });
      }

      const geocoded = await geocodeAddressWithGoogle(address);

      if (!geocoded) {
        // ZERO_RESULTS: la dirección es válida pero no existe en el mapa.
        return res.status(404).json({
          error: "No hemos encontrado esa dirección. Revísala e inténtalo de nuevo.",
          reason: "zero_results",
        });
      }

      return res.json({
        success: true,
        coords: {
          lat: geocoded.lat,
          lng: geocoded.lng,
        },
        formattedAddress: geocoded.formattedAddress,
        placeId: geocoded.placeId,
      });
    } catch (error: any) {
      console.error("Error en /api/geocode-address:", error);

      if (error instanceof GeocodeError) {
        return res.status(error.status).json({
          error: error.message,
          reason: error.reason,
        });
      }

      return res.status(500).json({
        error: "No se pudo geocodificar la dirección",
        reason: "upstream_error",
        details: error?.message || "Error desconocido",
      });
    }
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
        error: "No se pudo actualizar el contrato con la nueva sesión de Stripe",
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

  // [admin-only removed] GET /api/clients se ha eliminado. La gestión de
  // clientes se realiza desde la aplicación de back-office.

  app.get("/api/installations", async (req, res) => {
    try {
      const lat = req.query.lat ? Number(req.query.lat) : null;
      const lng = req.query.lng ? Number(req.query.lng) : null;
      // El radio se puede sobreescribir desde el cliente, pero si no se pasa
      // o es inválido se usa el valor legal por defecto del servidor.
      const requestedRadius = req.query.radius
        ? Number(req.query.radius)
        : INSTALLATION_SEARCH_RADIUS_METERS;
      const radius =
        Number.isFinite(requestedRadius) && requestedRadius > 0
          ? requestedRadius
          : INSTALLATION_SEARCH_RADIUS_METERS;

      const { data, error } = await supabase
        .from("installations")
        .select("*")
        .eq("active", true)
        .order("nombre_instalacion", { ascending: true });

      if (error) {
        console.error("Error obteniendo instalaciones:", error);
        return res.status(500).json({
          error: "Error fetching installations",
          details: error.message,
        });
      }

      let installations = (data ?? []).map((installation) => {
        const contractableKwpTotal = Number(
          installation.contractable_kwp_total ?? 0,
        );

        const contractableKwpReserved = Number(
          installation.contractable_kwp_reserved ?? 0,
        );

        const contractableKwpConfirmed = Number(
          installation.contractable_kwp_confirmed ?? 0,
        );

        const availableKwp = Math.max(
          contractableKwpTotal -
            contractableKwpReserved -
            contractableKwpConfirmed,
          0,
        );

        return {
          ...installation,
          available_kwp: availableKwp,
          reserved_kwp: contractableKwpReserved,
          confirmed_kwp: contractableKwpConfirmed,
        };
      });

      if (lat !== null && lng !== null) {
        installations = installations
          .map((installation) => {
            const distance_meters = haversineDistanceMeters(
              lat,
              lng,
              installation.lat,
              installation.lng,
            );

            return {
              ...installation,
              distance_meters,
            };
          })
          .filter((installation) => installation.distance_meters <= radius)
          .sort((a, b) => a.distance_meters - b.distance_meters);
      }

      res.json(installations);
    } catch (error: any) {
      console.error("Error inesperado obteniendo instalaciones:", error);
      res.status(500).json({
        error: "Error fetching installations",
        details: error.message,
      });
    }
  });

  // [admin-only removed] POST/PUT/DELETE /api/installations se han eliminado.
  // El CRUD de instalaciones se gestiona desde la aplicación de back-office.
  // El flujo público solo consume GET /api/installations para mostrarlas en
  // el mapa.

  // NOTA: la ruta POST /api/geocode-address ya está registrada más arriba
  // en este mismo archivo; la duplicación aquí era código muerto y se ha
  // eliminado.

  // =========================
  // VITE
  // =========================

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    const assetsPath = path.join(distPath, "assets");
    const indexPath = path.join(distPath, "index.html");

    console.log("[static] distPath:", distPath);
    console.log("[static] index exists:", fs.existsSync(indexPath));
    console.log("[static] assets exists:", fs.existsSync(assetsPath));
    if (fs.existsSync(assetsPath)) {
      console.log("[static] assets files:", fs.readdirSync(assetsPath));
    }

    app.use(
      "/assets",
      express.static(assetsPath, {
        index: false,
        immutable: true,
        maxAge: "1y",
      }),
    );

    app.use(express.static(distPath, { index: false, maxAge: 0 }));

    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();

      // Si pide un archivo real (.js, .css, .png, etc.) y no existe, 404.
      // Nunca devolver index.html para assets.
      if (path.extname(req.path)) {
        return res.status(404).send("Not found");
      }

      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      );
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      res.sendFile(indexPath);
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

// startServer();
