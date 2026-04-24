import type { Express } from "express";

import { createInstallationController } from "../controllers/installationController";

type InstallationController = ReturnType<typeof createInstallationController>;

export function registerInstallationsRoutes(
  app: Express,
  controller: InstallationController,
) {
  app.get("/api/installations", controller.listInstallations);
}
