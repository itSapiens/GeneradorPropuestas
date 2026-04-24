import type { Express } from "express";

import { createCoreController } from "../controllers/coreController";

type CoreController = ReturnType<typeof createCoreController>;

export function registerCoreRoutes(app: Express, controller: CoreController) {
  app.get("/api/config", controller.getConfig);
  app.get("/api/health", controller.getHealth);
}
