import { supabase } from "../../clients/supabaseClient";
import { sendReservationConfirmedEmail } from "../../../services/mailer.service";
import {
  formatCurrencyByLanguage,
  getLocaleFromLanguage,
  getPaymentReceiptTexts,
  normalizeAppLanguage,
  type AppLanguage,
} from "../../../domain/contracts/contractLocalization";
import { getContractContextFromStudy } from "../../../application/services/contractContextService";
import { createServerDependencies } from "../../serverDependencies";
import { downloadDriveFileAsBuffer } from "../drive/driveStorageService";
import { downloadSupabaseDocumentAsBuffer } from "../storage/supabaseDocumentStorageService";
import { GOTENBERG_URL } from "../../config/env";
import { convertHtmlToPdfWithGotenberg } from "../pdf/gotenbergPdfService";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  const texts = getPaymentReceiptTexts(params.language);
  const locale = getLocaleFromLanguage(params.language);
  const paymentDate = new Date(params.paidAt).toLocaleString(locale);

  const row = (label: string, value: string) => `
    <div class="row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value || "-")}</strong>
    </div>
  `;

  const section = (title: string, rows: string) => `
    <section class="box">
      <h2>${escapeHtml(title)}</h2>
      ${rows}
    </section>
  `;

  const html = `<!doctype html>
<html lang="${params.language}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(texts.title)}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body {
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.55;
      margin: 0;
    }
    .page { min-height: 297mm; padding: 18mm; }
    h1 {
      color: #07005f;
      font-size: 28px;
      line-height: 1.1;
      margin: 0 0 6px;
    }
    .subtitle { color: #6b7280; margin-bottom: 24px; }
    .box {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      margin-bottom: 14px;
      padding: 14px 16px;
    }
    h2 {
      color: #07005f;
      font-size: 16px;
      margin: 0 0 10px;
    }
    .row {
      border-bottom: 1px solid #edf0f2;
      display: grid;
      gap: 14px;
      grid-template-columns: 170px 1fr;
      padding: 7px 0;
    }
    .row:last-child { border-bottom: 0; }
    .row span { color: #6b7280; font-weight: 700; }
    .row strong { color: #111827; font-weight: 700; overflow-wrap: anywhere; }
    .footer {
      border-top: 1px solid #dce0e6;
      color: #6b7280;
      font-size: 11px;
      margin-top: 24px;
      padding-top: 16px;
    }
  </style>
</head>
<body>
  <main class="page">
    <h1>${escapeHtml(texts.title)}</h1>
    <div class="subtitle">${escapeHtml(texts.precontractLabel)} ${escapeHtml(params.contractNumber)}</div>
    ${section(texts.holderSection, [
      row(texts.client, params.clientName),
      row("DNI", params.clientDni),
    ].join(""))}
    ${section(texts.reservationSection, [
      row(texts.contractId, params.contractId),
      row(texts.reservationId, params.reservationId),
      row(texts.installation, params.installationName),
      row(texts.reservedPower, `${params.reservedKwp} kWp`),
      row(
        texts.paidAmount,
        formatCurrencyByLanguage(params.signalAmount, params.currency, params.language),
      ),
      row(texts.currency, params.currency.toUpperCase()),
      row(texts.paymentDate, paymentDate),
    ].join(""))}
    ${section(texts.stripeSection, [
      row(texts.checkoutSessionId, params.stripeSessionId),
      row(texts.paymentIntentId, params.stripePaymentIntentId ?? "-"),
    ].join(""))}
    <div class="footer">${escapeHtml(texts.footer)}</div>
  </main>
</body>
</html>`;

  return convertHtmlToPdfWithGotenberg({
    gotenbergUrl: GOTENBERG_URL,
    html,
  });
}

export async function sendReservationConfirmationAfterPayment(params: {
  reservationId: string;
  stripeSessionId: string;
  stripePaymentIntentId?: string | null;
}) {
  const { reservationId, stripeSessionId, stripePaymentIntentId } = params;

  const { data: reservation, error: reservationError } = await supabase
    .from("installation_reservations")
    .select("*")
    .eq("id", reservationId)
    .single();

  if (reservationError || !reservation) {
    throw new Error(
      reservationError?.message ||
        "No se encontró la reserva para enviar el correo",
    );
  }

  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("*")
    .eq("id", reservation.contract_id)
    .single();

  if (contractError || !contract) {
    throw new Error(
      contractError?.message || "No se encontró el precontrato asociado",
    );
  }

  const alreadySentAt =
    (reservation.metadata as any)?.payment_confirmation_email_sent_at ?? null;

  if (alreadySentAt) {
    return;
  }

  const deps = createServerDependencies();
  const ctx = await getContractContextFromStudy(deps, contract.study_id);
  const language = normalizeAppLanguage(ctx.study?.language);

  if (!ctx.client.email) {
    throw new Error("El cliente no tiene email");
  }

  if (!contract.contract_supabase_path && !contract.contract_drive_file_id) {
    throw new Error("El precontrato no tiene PDF asociado");
  }

  const precontractFile = contract.contract_supabase_path
    ? await downloadSupabaseDocumentAsBuffer({
        bucket: contract.contract_supabase_bucket,
        path: contract.contract_supabase_path,
      })
    : await downloadDriveFileAsBuffer(contract.contract_drive_file_id);

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
    throw new Error(
      `No se pudo marcar el email como enviado: ${updateReservationError.message}`,
    );
  }
}
