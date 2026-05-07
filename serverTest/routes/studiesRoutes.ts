import type { Express } from "express";
import type multer from "multer";

import { createStudyController } from "../controllers/studyController";

type StudyController = ReturnType<typeof createStudyController>;

export function registerStudiesRoutes(
  app: Express,
  upload: multer.Multer,
  controller: StudyController,
) {
  app.post("/api/studies/:id/send-proposal-email", controller.sendProposalEmail);
  app.post(
    "/api/studies/:id/auto-assign-installation",
    controller.autoAssignInstallation,
  );
  app.post(
    "/api/confirm-study",
    upload.fields([
      { name: "invoice", maxCount: 1 },
      { name: "proposal", maxCount: 1 },
      { name: "file", maxCount: 1 },
    ]),
    controller.confirmStudy,
  );
}
