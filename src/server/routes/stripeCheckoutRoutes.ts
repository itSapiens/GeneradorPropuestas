import type { Express } from "express";

import { createStripeController } from "../controllers/stripeController";

type StripeController = ReturnType<typeof createStripeController>;

export function registerStripeCheckoutRoutes(
  app: Express,
  controller: StripeController,
) {
  app.get(
    "/api/stripe/checkout-session-status",
    controller.getCheckoutSessionStatus,
  );
}
