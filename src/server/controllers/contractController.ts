import type { Request, Response } from "express";

import type { ServerDependencies } from "../application/ports/serverDependencies";
import {
  generateContractFromAccessUseCase,
  generateContractFromStudyUseCase,
  getContractByIdUseCase,
  getContractReservationStatusUseCase,
  previewProposalAccessUseCase,
  retryContractPaymentUseCase,
  signContractUseCase,
  startBankTransferPaymentUseCase,
  startStripePaymentUseCase,
  validateProposalAccessUseCase,
} from "../application/use-cases/contractUseCases";
import { sendErrorResponse } from "../shared/http/sendErrorResponse";

export function createContractController(deps: ServerDependencies) {
  return {
    async generateFromAccess(req: Request, res: Response) {
      try {
        const result = await generateContractFromAccessUseCase(deps, {
          proposalMode: req.body?.proposalMode,
          resumeToken: String(req.body?.resumeToken || "").trim(),
        });

        return res.json(result);
      } catch (error) {
        return sendErrorResponse(
          res,
          error,
          "No se pudo preparar el contrato desde el acceso",
        );
      }
    },
    async generateFromStudy(req: Request, res: Response) {
      try {
        const result = await generateContractFromStudyUseCase(deps, {
          proposalMode: req.body?.proposalMode,
          studyId: req.params.studyId,
        });

        return res.json(result);
      } catch (error) {
        return sendErrorResponse(res, error, "No se pudo generar el contrato");
      }
    },
    async getById(req: Request, res: Response) {
      try {
        const result = await getContractByIdUseCase(deps, req.params.id);
        return res.json(result);
      } catch (error) {
        return sendErrorResponse(
          res,
          error,
          "No se pudo obtener el contrato",
        );
      }
    },
    async getReservationStatus(req: Request, res: Response) {
      try {
        const result = await getContractReservationStatusUseCase(
          deps,
          req.params.id,
        );
        return res.json(result);
      } catch (error) {
        return sendErrorResponse(
          res,
          error,
          "No se pudo consultar el estado de la reserva",
        );
      }
    },
    async previewProposalAccess(req: Request, res: Response) {
      try {
        const result = await previewProposalAccessUseCase(
          deps,
          String(req.query?.token || "").trim(),
        );
        return res.json(result);
      } catch (error) {
        return sendErrorResponse(
          res,
          error,
          "No se pudo obtener la vista previa del acceso",
        );
      }
    },
    async retryPayment(req: Request, res: Response) {
      try {
        const result = await retryContractPaymentUseCase(deps, req.params.id);
        return res.json(result);
      } catch (error) {
        return sendErrorResponse(res, error, "No se pudo regenerar el pago");
      }
    },
    async sign(req: Request, res: Response) {
      try {
        const files =
          (req.files as {
            [fieldname: string]: Express.Multer.File[];
          }) || {};

        const result = await signContractUseCase(deps, {
          contractId: req.params.id,
          currency: req.body?.currency,
          signalAmount: req.body?.signalAmount ?? req.body?.signal_amount,
          signedContractFile: files.signed_contract?.[0] || files.file?.[0] || null,
        });

        return res.status(201).json(result);
      } catch (error) {
        console.error("[contracts.sign] error", error);
        return sendErrorResponse(
          res,
          error,
          "No se pudo firmar/subir el contrato",
        );
      }
    },
    async startBankTransferPayment(req: Request, res: Response) {
      try {
        const result = await startBankTransferPaymentUseCase(
          deps,
          req.params.id,
        );
        return res.json(result);
      } catch (error) {
        return sendErrorResponse(
          res,
          error,
          "No se pudo seleccionar el pago por transferencia bancaria",
        );
      }
    },
    async startStripePayment(req: Request, res: Response) {
      try {
        const result = await startStripePaymentUseCase(deps, req.params.id);
        return res.json(result);
      } catch (error) {
        return sendErrorResponse(
          res,
          error,
          "No se pudo iniciar el pago con Stripe",
        );
      }
    },
    async validateProposalAccess(req: Request, res: Response) {
      try {
        const result = await validateProposalAccessUseCase(deps, {
          apellidos: String(req.body?.apellidos || "").trim(),
          dni: String(req.body?.dni || "").trim(),
          nombre: String(req.body?.nombre || "").trim(),
          token: String(req.body?.token || "").trim(),
        });

        return res.json(result);
      } catch (error) {
        return sendErrorResponse(
          res,
          error,
          "No se pudo validar el acceso a la propuesta",
        );
      }
    },
  };
}
