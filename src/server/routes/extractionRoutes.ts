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

      // ── LOGS DE EXTRACCIÓN IA ────────────────────────────────────────────
      console.log(`[extract-bill] ✅ Extracción completada: ${uploadedFile.originalname}`);
      console.log(`[extract-bill] ── CLIENTE ──────────────────────────────`);
      console.log(`  Nombre:    ${result.customer.fullName ?? "(no detectado)"}`);
      console.log(`  DNI/NIF:   ${result.customer.dni ?? "(no detectado)"}`);
      console.log(`  CUPS:      ${result.customer.cups ?? "(no detectado)"}`);
      console.log(`  IBAN:      ${result.customer.iban ?? "(no detectado)"}${result.customer.ibanNeedsCompletion ? " ⚠️ oculto" : ""}`);
      console.log(`[extract-bill] ── LOCALIZACIÓN ─────────────────────────`);
      console.log(`  Dirección: ${result.location.address ?? "(no detectada)"}`);
      console.log(`[extract-bill] ── FACTURA ──────────────────────────────`);
      console.log(`  Tarifa:    ${result.invoice_data.type ?? "(no detectada)"}`);
      console.log(`  Días fac.: ${result.invoice_data.billedDays ?? "(no detectado)"}`);
      console.log(`  Consumo factura (kWh): ${result.invoice_data.currentInvoiceConsumptionKwh ?? "(no detectado)"}`);
      console.log(`  Consumo medio mensual (kWh): ${result.invoice_data.averageMonthlyConsumptionKwh ?? "(no calculado)"}`);
      console.log(`  Importe energía variable (€): ${result.invoice_data.invoiceVariableEnergyAmountEur ?? "(no detectado)"}`);
      console.log(`  Potencia contratada: ${result.invoice_data.contractedPowerText ?? `P1=${result.invoice_data.contractedPowerP1 ?? "?"} kW / P2=${result.invoice_data.contractedPowerP2 ?? "?"} kW`}`);
      const p = result.invoice_data.periods;
      console.log(`  Consumos por periodo (kWh): P1=${p.P1 ?? "-"} P2=${p.P2 ?? "-"} P3=${p.P3 ?? "-"} P4=${p.P4 ?? "-"} P5=${p.P5 ?? "-"} P6=${p.P6 ?? "-"}`);
      const pr = result.invoice_data.periodPricesEurPerKwh;
      console.log(`  Precios por periodo (€/kWh): P1=${pr.P1 ?? "-"} P2=${pr.P2 ?? "-"} P3=${pr.P3 ?? "-"} P4=${pr.P4 ?? "-"} P5=${pr.P5 ?? "-"} P6=${pr.P6 ?? "-"}`);
      console.log(`[extract-bill] ── CALIDAD EXTRACCIÓN ───────────────────`);
      console.log(`  Confianza: ${result.extraction.confidenceScore ?? "?"}`);
      console.log(`  Método:    ${result.extraction.extractionMethod}, fallback=${result.extraction.fallbackUsed}`);
      if (result.extraction.warnings.length > 0)
        console.warn(`  Avisos:    ${result.extraction.warnings.join(" | ")}`);
      if (result.extraction.missingFields.length > 0)
        console.warn(`  Campos faltantes: ${result.extraction.missingFields.join(", ")}`);
      if (result.extraction.manualReviewFields.length > 0)
        console.warn(`  Revisar manualmente: ${result.extraction.manualReviewFields.join(", ")}`);
      console.log(`[extract-bill] ────────────────────────────────────────`);
      // ────────────────────────────────────────────────────────────────────

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
