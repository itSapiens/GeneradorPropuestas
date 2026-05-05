import type { Request, Response } from "express";

import type { ServerDependencies } from "../application/ports/serverDependencies";
import {
  getCheckoutSessionStatusUseCase,
  handleStripeWebhookUseCase,
} from "../application/use-cases/stripeUseCases";
import { sendErrorResponse } from "../shared/http/sendErrorResponse";

export function createStripeController(deps: ServerDependencies) {
  return {
    async getCheckoutSessionStatus(req: Request, res: Response) {
      try {
        const result = await getCheckoutSessionStatusUseCase(deps, {
          contractId: String(req.query.contractId || ""),
          sessionId: String(req.query.session_id || ""),
        });

        return res.json(result);
      } catch (error) {
        return sendErrorResponse(
          res,
          error,
          "No se pudo consultar el estado de la sesión de Stripe",
        );
      }
    },
    async handleWebhook(req: Request, res: Response) {
      try {
        const signature = req.headers["stripe-signature"];

        if (!signature || Array.isArray(signature)) {
          return res.status(400).send("Falta Stripe-Signature");
        }

        const result = await handleStripeWebhookUseCase(deps, {
          rawBody: req.body,
          signature,
        });

        return res.json(result);
      } catch (error: any) {
        if (error?.message?.startsWith("Webhook Error:")) {
          return res.status(400).send(error.message);
        }

        return sendErrorResponse(
          res,
          error,
          "No se pudo procesar el webhook de Stripe",
        );
      }
    },
  };
}
