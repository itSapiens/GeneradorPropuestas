import type { Express } from "express";
import type multer from "multer";

import { createContractController } from "../controllers/contractController";
type ContractController = ReturnType<typeof createContractController>;

export function registerContractsRoutes(
  app: Express,
  upload: multer.Multer,
  controller: ContractController,
) {
  app.post("/api/contracts/:id/retry-payment", controller.retryPayment);
  app.get("/api/contracts/:id/reservation-status", controller.getReservationStatus);
  app.get(
    "/api/contracts/proposal-access/preview",
    controller.previewProposalAccess,
  );
  app.post(
    "/api/contracts/proposal-access/validate",
    controller.validateProposalAccess,
  );
  app.post(
    "/api/contracts/generate-from-access",
    controller.generateFromAccess,
  );
  app.post(
    "/api/contracts/generate-from-study/:studyId",
    controller.generateFromStudy,
  );
  app.get("/api/contracts/:id", controller.getById);
  app.post(
    "/api/contracts/:id/sign",
    upload.fields([
      { name: "signed_contract", maxCount: 1 },
      { name: "file", maxCount: 1 },
    ]),
    controller.sign,
  );
  app.post("/api/contracts/:id/payments/stripe", controller.startStripePayment);
  app.post(
    "/api/contracts/:id/payments/bank-transfer",
    controller.startBankTransferPayment,
  );
}
