import z from "zod";
import { AppLanguage, ValidationBillType } from "@/src/entities/proposal/domain/proposal.types";

export const isBillType = (value: unknown): value is ValidationBillType => {
  return value === "2TD" || value === "3TD";
};

export const parseFormNumber = (value: unknown): number | undefined => {
  if (value === "" || value === null || value === undefined) return undefined;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : Number.NaN;
  }

  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    if (!normalized) return undefined;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }

  return Number.NaN;
};

export function roundUpToDecimals(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.ceil(value * factor) / factor;
}

export function normalizeAndRoundUp(
  value: unknown,
  decimals: number,
): number | undefined {
  const parsed = parseFormNumber(value);

  if (parsed === undefined || Number.isNaN(parsed)) return undefined;

  return roundUpToDecimals(parsed, decimals);
}

export function normalizeAppLanguage(value?: string): AppLanguage {
  const lang = (value || "es").toLowerCase().trim();

  if (lang.startsWith("ca")) return "ca";
  if (lang.startsWith("val")) return "val";
  if (lang.startsWith("gl")) return "gl";
  return "es";
}

export function buildLastName(
  lastname1: string | null | undefined,
  lastname2: string | null | undefined,
): string {
  return [lastname1, lastname2].filter(Boolean).join(" ").trim();
}

export function getPositiveFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}
//Calculo de la inversion según la fórmula: Coste inversión = Coste kWh inversión * Potencia recomendada (kWp) * Horas efectivas * 25 años  24681-8550

 export function parseNumericValue(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export  function getFirstNumericField(
  source: unknown,
  keys: string[],
  fallback = 0,
): number {
  if (!source || typeof source !== "object") return fallback;

  const record = source as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return fallback;
}

export function formatPaybackYears(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "-";
  return `${value.toFixed(1).replace(".", ",")} años`;
}
export function getDateLocale(language: string) {
  if (language === "val") return "ca-ES";
  if (language === "ca") return "ca-ES";
  return "es-ES";
}

export const optionalNumberField = z.preprocess(
  (value) => parseFormNumber(value),
  z
    .number({
      error: "Debe ser un número válido",
    })
    .min(0, { error: "Debe ser un número válido" })
    .optional(),
);