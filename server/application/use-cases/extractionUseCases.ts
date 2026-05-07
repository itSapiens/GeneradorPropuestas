import crypto from "node:crypto";

import type { ServerDependencies } from "../ports/serverDependencies";
import { badRequest } from "../../shared/http/httpError";

const EXTRACTION_CACHE_TTL_MS = Number(
  process.env.EXTRACTION_CACHE_TTL_MS || 30 * 60 * 1000,
);
const EXTRACTION_CACHE_MAX_ENTRIES = Number(
  process.env.EXTRACTION_CACHE_MAX_ENTRIES || 100,
);
const EXTRACTION_CACHE_VERSION = "2026-05-07-switch-v2";

type ExtractionCacheEntry = { data: any; ts: number };
const extractionCache = new Map<string, ExtractionCacheEntry>();

function extractionCacheGet(key: string): any | null {
  const entry = extractionCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > EXTRACTION_CACHE_TTL_MS) {
    extractionCache.delete(key);
    return null;
  }
  return entry.data;
}

function extractionCacheSet(key: string, data: any): void {
  if (extractionCache.size >= EXTRACTION_CACHE_MAX_ENTRIES) {
    const oldestKey = extractionCache.keys().next().value;
    if (oldestKey) extractionCache.delete(oldestKey);
  }
  extractionCache.set(key, { data, ts: Date.now() });
}

export async function extractBillUseCase(
  deps: ServerDependencies,
  uploadedFile: Express.Multer.File | null | undefined,
) {
  if (!uploadedFile) {
    throw badRequest("No se ha recibido ningún archivo");
  }

  const allowedMimeTypes = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
  ];

  if (!allowedMimeTypes.includes(uploadedFile.mimetype)) {
    throw badRequest(
      "Tipo de archivo no soportado",
      `MIME recibido: ${uploadedFile.mimetype}`,
    );
  }

  const cacheKey = crypto
    .createHash("sha256")
    .update(EXTRACTION_CACHE_VERSION)
    .update(uploadedFile.buffer)
    .digest("hex");

  const cached = extractionCacheGet(cacheKey);
  if (cached) {
    return cached;
  }

  const result = await deps.services.extraction.extractInvoiceWithFallback({
    buffer: uploadedFile.buffer,
    fileName: uploadedFile.originalname,
    mimeType: uploadedFile.mimetype,
  });

  extractionCacheSet(cacheKey, result);

  return result;
}
