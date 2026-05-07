import type Stripe from "stripe";

import type { ServerDependencies } from "../ports/serverDependencies";
import { notFound, badRequest } from "../../shared/http/httpError";

export async function getCheckoutSessionStatusUseCase(
  deps: ServerDependencies,
  params: {
    contractId?: string | null;
    sessionId: string;
  },
) {
  const sessionId = String(params.sessionId || "").trim();

  if (!sessionId) {
    throw badRequest("Falta session_id");
  }

  const session = await deps.services.stripe.retrieveCheckoutSession(sessionId);

  const reservationId =
    String(session.client_reference_id || "") ||
    String(session.metadata?.reservationId || "");

  const contractId =
    String(session.metadata?.contractId || "") || String(params.contractId || "");

  const reservation = reservationId
    ? await deps.repositories.reservations.findById(reservationId)
    : null;

  const effectiveContractId = reservation?.contract_id ?? contractId ?? null;
  const contract = effectiveContractId
    ? await deps.repositories.contracts.findById(effectiveContractId)
    : null;

  return {
    contract: contract
      ? {
          contractNumber: contract.contract_number,
          contractUrl: contract.contract_drive_url ?? null,
          id: contract.id,
          status: contract.status,
        }
      : null,
    reservation: reservation
      ? {
          confirmedAt: reservation.confirmed_at,
          contractId: reservation.contract_id,
          currency: reservation.currency,
          id: reservation.id,
          paymentDeadlineAt: reservation.payment_deadline_at,
          paymentStatus: reservation.payment_status,
          releasedAt: reservation.released_at,
          reservationStatus: reservation.reservation_status,
          signalAmount: reservation.signal_amount,
        }
      : null,
    session: {
      customerEmail: session.customer_email ?? null,
      id: session.id,
      paymentStatus: session.payment_status,
      status: session.status,
    },
    success: true,
    waitingWebhook:
      session.status === "complete" && reservation?.payment_status !== "paid",
  };
}

export async function handleStripeWebhookUseCase(
  deps: ServerDependencies,
  params: {
    rawBody: Buffer;
    signature: string;
  },
) {
  const event = deps.services.stripe.constructWebhookEvent({
    rawBody: params.rawBody,
    signature: params.signature,
  }) as Stripe.Event;

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      const reservationId =
        String(session.client_reference_id || "") ||
        String(session.metadata?.reservationId || "");

      if (!reservationId) {
        return { received: true };
      }

      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || null;

      await deps.repositories.reservations.confirmPayment({
        reservationId,
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
      });

      await deps.services.mail.sendReservationConfirmationAfterPayment({
        reservationId,
        stripePaymentIntentId: paymentIntentId,
        stripeSessionId: session.id,
      });

      return { received: true };
    }

    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const reservationId =
        String(session.client_reference_id || "") ||
        String(session.metadata?.reservationId || "");

      if (!reservationId) {
        return { received: true };
      }

      const paymentStatus =
        event.type === "checkout.session.expired" ? "expired" : "failed";

      await deps.repositories.reservations.releaseReservation({
        paymentStatus,
        reason: `stripe_${event.type}`,
        reservationId,
      });

      return { received: true };
    }

    default:
      return { received: true };
  }
}
