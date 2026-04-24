import cors from "cors";
import express from "express";
import multer from "multer";

import { createCoreController } from "../controllers/coreController";
import { createContractController } from "../controllers/contractController";
import { createExtractionController } from "../controllers/extractionController";
import { createGeocodingController } from "../controllers/geocodingController";
import { createInstallationController } from "../controllers/installationController";
import { createStripeController } from "../controllers/stripeController";
import { createStudyController } from "../controllers/studyController";
import { createServerDependencies } from "../infrastructure/serverDependencies";
import { registerContractsRoutes } from "../routes/contractsRoutes";
import { registerCoreRoutes } from "../routes/coreRoutes";
import { registerExtractionRoutes } from "../routes/extractionRoutes";
import { registerGeocodingRoutes } from "../routes/geocodingRoutes";
import { registerInstallationsRoutes } from "../routes/installationsRoutes";
import { registerSpaRoutes } from "../routes/spaRoutes";
import { registerStripeCheckoutRoutes } from "../routes/stripeCheckoutRoutes";
import { registerStripeWebhookRoute } from "../routes/stripeWebhookRoutes";
import { registerStudiesRoutes } from "../routes/studiesRoutes";

export async function startServer() {
  const deps = createServerDependencies();
  const app = express();
  const upload = multer({
    limits: {
      fileSize: 15 * 1024 * 1024,
    },
    storage: multer.memoryStorage(),
  });

  const coreController = createCoreController();
  const extractionController = createExtractionController(deps);
  const geocodingController = createGeocodingController(deps);
  const installationController = createInstallationController(deps);
  const stripeController = createStripeController(deps);
  const studyController = createStudyController(deps);
  const contractController = createContractController(deps);

  app.use(cors());
  registerStripeWebhookRoute(app, stripeController);

  app.use(express.json({ limit: "10mb" }));

  registerCoreRoutes(app, coreController);
  registerExtractionRoutes(app, upload, extractionController);
  registerStudiesRoutes(app, upload, studyController);
  registerContractsRoutes(app, upload, contractController);
  registerGeocodingRoutes(app, geocodingController);
  registerStripeCheckoutRoutes(app, stripeController);
  registerInstallationsRoutes(app, installationController);

  await registerSpaRoutes(app);

  app.listen(deps.env.port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${deps.env.port}`);
  });
}
