import type { Request, Response } from "express";

import type { ServerDependencies } from "../application/ports/serverDependencies";
import { listInstallationsUseCase } from "../application/use-cases/installationUseCases";
import { sendErrorResponse } from "../shared/http/sendErrorResponse";

export function createInstallationController(deps: ServerDependencies) {
  return {
    async listInstallations(req: Request, res: Response) {
      try {
        const lat = req.query.lat ? Number(req.query.lat) : null;
        const lng = req.query.lng ? Number(req.query.lng) : null;
        const radius = req.query.radius ? Number(req.query.radius) : null;

        const installations = await listInstallationsUseCase(deps, {
          lat,
          lng,
          radius,
        });

        return res.json(installations);
      } catch (error) {
        return sendErrorResponse(
          res,
          error,
          "Error fetching installations",
        );
      }
    },
  };
}
