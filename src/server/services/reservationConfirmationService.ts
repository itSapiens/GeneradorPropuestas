import { jsPDF } from "jspdf";

import { supabase } from "../clients/supabaseClient";
import { sendReservationConfirmedEmail } from "../../services/mailer.service";
import {
  formatCurrencyByLanguage,
  getLocaleFromLanguage,
  getPaymentReceiptTexts,
  normalizeAppLanguage,
  type AppLanguage,
} from "./contractLocalizationService";
import { getContractContextFromStudy } from "./contractContextService";
import { downloadDriveFileAsBuffer } from "./driveStorageService";

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

export async function sendReservationConfirmationAfterPayment(params: {
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
