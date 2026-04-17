import express, { type Express } from "express";
import type Stripe from "stripe";

import { stripe } from "../clients/stripeClient";
import { supabase } from "../clients/supabaseClient";
import { STRIPE_WEBHOOK_SECRET } from "../config/env";

interface RegisterStripeWebhookRouteParams {
  sendReservationConfirmationAfterPayment: (params: {
    reservationId: string;
    stripeSessionId: string;
    stripePaymentIntentId?: string | null;
  }) => Promise<void>;
}

export function registerStripeWebhookRoute(
  app: Express,
  { sendReservationConfirmationAfterPayment }: RegisterStripeWebhookRouteParams,
) {
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
}
