import type { Request, Response } from "express";

import type { ServerDependencies } from "../application/ports/serverDependencies";
import { generateProposalPdfUseCase } from "../application/use-cases/proposalPdfUseCases";
import { sendErrorResponse } from "../shared/http/sendErrorResponse";

export function createProposalPdfController(deps: ServerDependencies) {
  return {
    async generate(req: Request, res: Response) {
      try {
        const pdfBuffer = await generateProposalPdfUseCase(deps, req.body);

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="propuesta-solar.pdf"',
        );

        return res.status(200).send(pdfBuffer);
      } catch (error) {
        return sendErrorResponse(res, error, "No se pudo generar el PDF");
      }
    },
  };
}
