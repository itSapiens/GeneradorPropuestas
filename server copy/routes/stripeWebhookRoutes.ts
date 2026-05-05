import express, { type Express } from "express";

import { createStripeController } from "../controllers/stripeController";

type StripeController = ReturnType<typeof createStripeController>;

export function registerStripeWebhookRoute(
  app: Express,
  controller: StripeController,
) {
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    controller.handleWebhook,
  );
}
