import type { Request, Response } from "express";

import { getConfigUseCase, getHealthUseCase } from "../application/use-cases/coreUseCases";

export function createCoreController() {
  return {
    getConfig(_req: Request, res: Response) {
      return res.json(getConfigUseCase());
    },
    getHealth(_req: Request, res: Response) {
      return res.json(getHealthUseCase());
    },
  };
}
