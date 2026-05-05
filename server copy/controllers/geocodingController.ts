import type { Request, Response } from "express";

import type { ServerDependencies } from "../application/ports/serverDependencies";
import { geocodeAddressUseCase } from "../application/use-cases/geocodingUseCases";
import { sendErrorResponse } from "../shared/http/sendErrorResponse";

export function createGeocodingController(deps: ServerDependencies) {
  return {
    async geocodeAddress(req: Request, res: Response) {
      try {
        const result = await geocodeAddressUseCase(
          deps,
          String(req.body?.address || ""),
        );

        if (!result.success) {
          return res.status(404).json({
            error:
              "No hemos encontrado esa dirección. Revísala e inténtalo de nuevo.",
            reason: "zero_results",
          });
        }

        return res.json(result);
      } catch (error) {
        const geocodeError = deps.services.geocoding.getGeocodeErrorResponse(error);

        if (geocodeError) {
          return res.status(geocodeError.status).json({
            error: geocodeError.error,
            reason: geocodeError.reason,
          });
        }

        return sendErrorResponse(
          res,
          error,
          "No se pudo geocodificar la dirección",
        );
      }
    },
  };
}
