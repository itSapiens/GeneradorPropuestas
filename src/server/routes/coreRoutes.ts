import type { Express } from "express";

export function registerCoreRoutes(app: Express) {
  app.get("/api/config", (_req, res) => {
    res.json({
      googleMapsApiKey: process.env.VITE_GOOGLE_MAPS_API_KEY || "",
    });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
}
