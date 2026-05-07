import type { Request, Response } from "express";

import type { ServerDependencies } from "../application/ports/serverDependencies";
import {
  autoAssignInstallationUseCase,
  confirmStudyUseCase,
  sendStudyProposalEmailUseCase,
} from "../application/use-cases/studyUseCases";
import { toPositiveNumber } from "../utils/parsingUtils";
import { sendErrorResponse } from "../shared/http/sendErrorResponse";

export function createStudyController(deps: ServerDependencies) {
  return {
    async autoAssignInstallation(req: Request, res: Response) {
      try {
        const result = await autoAssignInstallationUseCase(deps, {
          assignedKwp: toPositiveNumber(
            req.body.assignedKwp ??
              req.body.assigned_kwp ??
              req.body?.calculation?.assigned_kwp ??
              req.body?.calculation?.required_kwp,
          ),
          studyId: req.params.id,
        });

        return res.json(result);
      } catch (error) {
        return sendErrorResponse(
          res,
          error,
          "No se pudo autoasignar la instalación",
        );
      }
    },
    async confirmStudy(req: Request, res: Response) {
      try {
        const files =
          (req.files as {
            [fieldname: string]: Express.Multer.File[];
          }) || {};

        const result = await confirmStudyUseCase(deps, {
          body: req.body ?? {},
          files: {
            invoiceFile: files.invoice?.[0] || files.file?.[0] || null,
            proposalFile: files.proposal?.[0] || null,
          },
        });

        return res.status(201).json(result);
      } catch (error) {
        return sendErrorResponse(res, error, "No se pudo confirmar el estudio");
      }
    },
    async sendProposalEmail(req: Request, res: Response) {
      try {
        const result = await sendStudyProposalEmailUseCase(deps, {
          email: req.body?.email,
          studyId: req.params.id,
        });

        return res.json(result);
      } catch (error) {
        return sendErrorResponse(res, error, "No se pudo reenviar el correo");
      }
    },
  };
}
