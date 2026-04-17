import { stripe } from "../clients/stripeClient";
import { FRONTEND_URL } from "../config/env";

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

export async function createCheckoutSessionForReservation(params: {
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
