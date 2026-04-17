import type { Express } from "express";

type GeocodeResult = {
  lat: number;
  lng: number;
  formattedAddress: string | null;
  placeId: string | null;
};

type GeocodeRouteError = {
  status: number;
  reason: string;
  message: string;
};

interface RegisterGeocodingRoutesParams {
  geocodeAddressWithGoogle: (address: string) => Promise<GeocodeResult | null>;
  isGeocodeError: (error: unknown) => error is GeocodeRouteError;
}

export function registerGeocodingRoutes(
  app: Express,
  { geocodeAddressWithGoogle, isGeocodeError }: RegisterGeocodingRoutesParams,
) {
  app.post("/api/geocode-address", async (req, res) => {
    try {
      const address = String(req.body?.address || "").trim();

      if (!address) {
        return res.status(400).json({
          error: "La dirección es obligatoria",
          reason: "invalid_request",
        });
      }

      const geocoded = await geocodeAddressWithGoogle(address);

      if (!geocoded) {
        return res.status(404).json({
          error:
            "No hemos encontrado esa dirección. Revísala e inténtalo de nuevo.",
          reason: "zero_results",
        });
      }

      return res.json({
        success: true,
        coords: {
          lat: geocoded.lat,
          lng: geocoded.lng,
        },
        formattedAddress: geocoded.formattedAddress,
        placeId: geocoded.placeId,
      });
    } catch (error: any) {
      console.error("Error en /api/geocode-address:", error);

      if (isGeocodeError(error)) {
        return res.status(error.status).json({
          error: error.message,
          reason: error.reason,
        });
      }

      return res.status(500).json({
        error: "No se pudo geocodificar la dirección",
        reason: "upstream_error",
        details: error?.message || "Error desconocido",
      });
    }
  });
}
