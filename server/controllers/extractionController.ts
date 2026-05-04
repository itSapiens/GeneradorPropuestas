import type { Request, Response } from "express";

import type { ServerDependencies } from "../application/ports/serverDependencies";
import { extractBillUseCase } from "../application/use-cases/extractionUseCases";
import { sendErrorResponse } from "../shared/http/sendErrorResponse";

export function createExtractionController(deps: ServerDependencies) {
  return {
    async extractBill(req: Request, res: Response) {
      try {
        const result = await extractBillUseCase(deps, req.file);
        return res.json(result);
      } catch (error: any) {
        const message = error?.message || "";
        const isQuota = /quota|RESOURCE_EXHAUSTED|429/i.test(message);

        if (isQuota) {
          return res.status(429).json({
            error: " Inténtalo de nuevo en unos minutos.",
            details: message,
          });
        }

        if (error?.cause) {
          console.error("  causa:", error.cause);
        }

        return sendErrorResponse(
          res,
          error,
          "No se pudo extraer la información de la factura",
        );
      }
    },
  };
}
