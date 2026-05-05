import type { Response } from "express";

import { HttpError } from "./httpError";

export function sendErrorResponse(
  res: Response,
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({
      error: error.message,
      details: error.details,
    });
  }

  const details =
    error instanceof Error ? error.message : "Error desconocido";

  return res.status(500).json({
    error: fallbackMessage,
    details,
  });
}
