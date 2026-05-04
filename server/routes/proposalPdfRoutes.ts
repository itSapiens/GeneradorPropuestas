import type { Express } from "express";

import { createProposalPdfController } from "../controllers/proposalPdfController";

type ProposalPdfController = ReturnType<typeof createProposalPdfController>;

export function registerProposalPdfRoutes(
  app: Express,
  controller: ProposalPdfController,
) {
  app.post("/api/proposals/pdf", controller.generate);
}
