import type { Express } from "express";
import type multer from "multer";

import { createExtractionController } from "../controllers/extractionController";

type ExtractionController = ReturnType<typeof createExtractionController>;

export function registerExtractionRoutes(
  app: Express,
  upload: multer.Multer,
  controller: ExtractionController,
) {
  app.post("/api/extract-bill", upload.single("file"), controller.extractBill);
}
