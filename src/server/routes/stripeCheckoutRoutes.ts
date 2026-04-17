import type { Express } from "express";

import { stripe } from "../clients/stripeClient";
import { supabase } from "../clients/supabaseClient";

export function registerStripeCheckoutRoutes(app: Express) {
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
}
