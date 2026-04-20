import type { Express } from "express";
import type multer from "multer";
import crypto from "node:crypto";

import { extractInvoiceWithFallback } from "../../services/invoiceExtractionOrchestrator";

const EXTRACTION_CACHE_TTL_MS = Number(
  process.env.EXTRACTION_CACHE_TTL_MS || 30 * 60 * 1000,
);
const EXTRACTION_CACHE_MAX_ENTRIES = Number(
  process.env.EXTRACTION_CACHE_MAX_ENTRIES || 100,
);

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

export function registerExtractionRoutes(app: Express, upload: multer.Multer) {
  app.post("/api/extract-bill", upload.single("file"), async (req, res) => {
    try {
      const uploadedFile = req.file;

      if (!uploadedFile) {
        return res.status(400).json({
          error: "No se ha recibido ningún archivo",
        });
      }

      const allowedMimeTypes = [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/jpg",
        "image/webp",
      ];

      if (!allowedMimeTypes.includes(uploadedFile.mimetype)) {
        return res.status(400).json({
          error: "Tipo de archivo no soportado",
          details: `MIME recibido: ${uploadedFile.mimetype}`,
        });
      }

      const cacheKey = crypto
        .createHash("sha256")
        .update(uploadedFile.buffer)
        .digest("hex");

      const cached = extractionCacheGet(cacheKey);
      if (cached) {
        console.log(
          `[extract-bill] cache HIT para ${uploadedFile.originalname} (${cacheKey.slice(0, 12)}…)`,
        );
        return res.json(cached);
      }

      const result = await extractInvoiceWithFallback({
        buffer: uploadedFile.buffer,
        mimeType: uploadedFile.mimetype,
        fileName: uploadedFile.originalname,
      });

      extractionCacheSet(cacheKey, result);

      return res.json(result);
    } catch (error: any) {
      console.error("Error en /api/extract-bill:", error);
      if (error?.cause) {
        console.error("  causa:", error.cause);
      }

      const message = error?.message || "Error desconocido";
      const isQuota = /quota|RESOURCE_EXHAUSTED|429/i.test(message);

      return res.status(isQuota ? 429 : 500).json({
        error: isQuota
          ? " Inténtalo de nuevo en unos minutos."
          : "No se pudo extraer la información de la factura",
        details: message,
      });
    }
  });
}
