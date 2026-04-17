import type { Express } from "express";

import { supabase } from "../clients/supabaseClient";
import { INSTALLATION_SEARCH_RADIUS_METERS } from "../config/env";
import { haversineDistanceMeters } from "../utils/geo";

export function registerInstallationsRoutes(app: Express) {
  app.get("/api/installations", async (req, res) => {
    try {
      const lat = req.query.lat ? Number(req.query.lat) : null;
      const lng = req.query.lng ? Number(req.query.lng) : null;
      const requestedRadius = req.query.radius
        ? Number(req.query.radius)
        : INSTALLATION_SEARCH_RADIUS_METERS;
      const radius =
        Number.isFinite(requestedRadius) && requestedRadius > 0
          ? requestedRadius
          : INSTALLATION_SEARCH_RADIUS_METERS;

      const { data, error } = await supabase
        .from("installations")
        .select("*")
        .eq("active", true)
        .order("nombre_instalacion", { ascending: true });

      if (error) {
        console.error("Error obteniendo instalaciones:", error);
        return res.status(500).json({
          error: "Error fetching installations",
          details: error.message,
        });
      }

      let installations = (data ?? []).map((installation) => {
        const contractableKwpTotal = Number(
          installation.contractable_kwp_total ?? 0,
        );

        const contractableKwpReserved = Number(
          installation.contractable_kwp_reserved ?? 0,
        );

        const contractableKwpConfirmed = Number(
          installation.contractable_kwp_confirmed ?? 0,
        );

        const availableKwp = Math.max(
          contractableKwpTotal -
            contractableKwpReserved -
            contractableKwpConfirmed,
          0,
        );

        return {
          ...installation,
          available_kwp: availableKwp,
          reserved_kwp: contractableKwpReserved,
          confirmed_kwp: contractableKwpConfirmed,
        };
      });

      if (lat !== null && lng !== null) {
        installations = installations
          .map((installation) => {
            const distance_meters = haversineDistanceMeters(
              lat,
              lng,
              installation.lat,
              installation.lng,
            );

            return {
              ...installation,
              distance_meters,
            };
          })
          .filter((installation) => installation.distance_meters <= radius)
          .sort((a, b) => a.distance_meters - b.distance_meters);
      }

      res.json(installations);
    } catch (error: any) {
      console.error("Error inesperado obteniendo instalaciones:", error);
      res.status(500).json({
        error: "Error fetching installations",
        details: error.message,
      });
    }
  });
}
