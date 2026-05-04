import type { Express } from "express";

import { createGeocodingController } from "../controllers/geocodingController";

type GeocodingController = ReturnType<typeof createGeocodingController>;

export function registerGeocodingRoutes(
  app: Express,
  controller: GeocodingController,
) {
  app.post("/api/geocode-address", controller.geocodeAddress);
}
