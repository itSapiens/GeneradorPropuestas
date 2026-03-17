import type { ExtractedBillData, BillType } from "./geminiService";
import {
  createEmptyExtractionData,
  listMissingFields,
  safeNumber,
} from "./geminiService";

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cleanMultilineText(text: string): string {
  return normalizeSpaces(
    text.replace(/\r/g, "\n").replace(/\t/g, " ").replace(/[ ]{2,}/g, " ")
  );
}

function matchFirst(text: string, regexes: RegExp[]): string | null {
  for (const regex of regexes) {
    const match = text.match(regex);
    if (match?.[1]) return normalizeSpaces(match[1]);
  }
  return null;
}

function detectBillType(text: string): BillType {
  const normalized = text.toUpperCase();

  if (/\b3\.0TD\b|\b3TD\b/.test(normalized)) return "3TD";
  if (/\b2\.0TD\b|\b2TD\b/.test(normalized)) return "2TD";

  if (/\bP4\b|\bP5\b|\bP6\b/.test(normalized)) return "3TD";
  if (/\bP1\b/.test(normalized) && /\bP2\b/.test(normalized) && /\bP3\b/.test(normalized)) {
    return "2TD";
  }

  return null;
}

function extractDni(text: string): string | null {
  const regexes = [/\b([XYZxyz]?\d{7,8}[A-Za-z])\b/, /\b([A-HJNP-SUVW]\d{7,8})\b/];

  for (const regex of regexes) {
    const match = text.match(regex);
    if (match?.[1]) return match[1].toUpperCase().replace(/\s+/g, "");
  }

  return null;
}

function extractCups(text: string): string | null {
  const regexes = [
    /\bCUPS[:\s]*([A-Z]{2}[A-Z0-9]{16,22})\b/i,
    /\b([A-Z]{2}\d{16,22}[A-Z]{0,2})\b/,
  ];

  for (const regex of regexes) {
    const match = text.match(regex);
    if (match?.[1]) return match[1].toUpperCase().replace(/\s+/g, "");
  }

  return null;
}

function extractIban(text: string): string | null {
  const match = text.match(/\b([A-Z]{2}\d{2}(?:\s?\d{4}){5,7})\b/i);
  return match?.[1] ? match[1].toUpperCase().replace(/\s+/g, "") : null;
}

function extractEmail(text: string): string | null {
  const match = text.match(/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
  return match?.[1] ?? null;
}

function extractPhone(text: string): string | null {
  const match = text.match(/\b((?:\+34\s?)?[6-9]\d(?:[\s-]?\d{2}){4})\b/);
  return match?.[1]?.replace(/[^\d+]/g, "") ?? null;
}

function extractPostalCode(text: string): string | null {
  const match = text.match(/\b(0[1-9]|[1-4]\d|5[0-2])\d{3}\b/);
  return match?.[0] ?? null;
}

function extractConsumption(text: string): number | null {
  const regexes = [
    /consumo(?:\s+total)?[:\s]*([\d.,]+)\s*kwh/i,
    /energ[íi]a(?:\s+consumida)?[:\s]*([\d.,]+)\s*kwh/i,
    /([\d.,]+)\s*kwh/i,
  ];

  for (const regex of regexes) {
    const match = text.match(regex);
    if (match?.[1]) {
      const value = safeNumber(match[1]);
      if (value !== null) return value;
    }
  }

  return null;
}

function extractPeriod(
  text: string,
  period: "P1" | "P2" | "P3" | "P4" | "P5" | "P6"
): number | null {
  const regexes = [
    new RegExp(`${period}[^\\d]{0,20}([\\d.,]+)\\s*(?:€\\/kWh|€/kwh|kWh|€)`, "i"),
    new RegExp(`${period}[^\\d]{0,20}([\\d.,]+)`, "i"),
  ];

  for (const regex of regexes) {
    const match = text.match(regex);
    if (match?.[1]) {
      const value = safeNumber(match[1]);
      if (value !== null) return value;
    }
  }

  return null;
}

function extractNameAndLastNames(text: string) {
  const holder = matchFirst(text, [
    /titular[:\s]+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{4,})/i,
    /cliente[:\s]+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{4,})/i,
    /nombre[:\s]+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]{4,})/i,
  ]);

  if (!holder) {
    return { name: null, lastname1: null, lastname2: null };
  }

  const parts = holder.split(" ").map((part) => part.trim()).filter(Boolean);

  if (parts.length === 1) return { name: parts[0], lastname1: null, lastname2: null };
  if (parts.length === 2) return { name: parts[0], lastname1: parts[1], lastname2: null };

  return {
    name: parts[0],
    lastname1: parts[1] ?? null,
    lastname2: parts.slice(2).join(" ") || null,
  };
}

function extractAddress(text: string) {
  const postalCode = extractPostalCode(text);
  const address = matchFirst(text, [
    /direcci[oó]n(?:\s+de\s+suministro)?[:\s]+(.{10,140})/i,
    /domicilio[:\s]+(.{10,140})/i,
    /suministro[:\s]+(.{10,140})/i,
  ]);

  let city: string | null = null;
  let province: string | null = null;

  if (address && postalCode) {
    const afterPostal = address.match(new RegExp(`${postalCode}\\s+([A-Za-zÁÉÍÓÚÑ\\s-]{2,})`, "i"));
    if (afterPostal?.[1]) {
      const tail = normalizeSpaces(afterPostal[1]);
      const segments = tail.split(/[,/-]/).map((segment) => normalizeSpaces(segment));
      city = segments[0] || null;
      province = segments[1] || segments[0] || null;
    }
  }

  return {
    address,
    street: address,
    city,
    province,
    postalCode,
  };
}

function estimateConfidence(result: ExtractedBillData): number {
  let score = 0;

  if (result.customer.name) score += 0.1;
  if (result.customer.dni) score += 0.15;
  if (result.customer.cups) score += 0.15;
  if (result.customer.iban) score += 0.1;
  if (result.location.address) score += 0.1;
  if (result.location.postalCode) score += 0.05;
  if (result.location.city) score += 0.05;
  if (result.invoice_data.type) score += 0.1;
  if (result.invoice_data.consumptionKwh) score += 0.1;
  if (result.invoice_data.averageMonthlyConsumptionKwh) score += 0.05;

  const periods = result.invoice_data.periods;
  const periodCount = [periods.P1, periods.P2, periods.P3, periods.P4, periods.P5, periods.P6].filter(
    (value) => typeof value === "number"
  ).length;

  score += Math.min(periodCount * 0.025, 0.15);

  return Math.min(Number(score.toFixed(2)), 0.95);
}

export async function extractDataFromBillByRules(rawText: string): Promise<ExtractedBillData> {
  const text = cleanMultilineText(rawText);
  const result = createEmptyExtractionData();

  if (!text) {
    result.extraction.confidenceScore = 0.1;
    result.extraction.warnings.push("No se recibió texto para aplicar la extracción por reglas.");
    result.extraction.extractionMethod = "rules";
    result.extraction.fallbackUsed = true;
    result.extraction.missingFields = listMissingFields(result);
    return result;
  }

  const names = extractNameAndLastNames(text);
  const addressData = extractAddress(text);

  result.customer.name = names.name;
  result.customer.lastname1 = names.lastname1;
  result.customer.lastname2 = names.lastname2;
  result.customer.dni = extractDni(text);
  result.customer.cups = extractCups(text);
  result.customer.iban = extractIban(text);
  result.customer.email = extractEmail(text);
  result.customer.phone = extractPhone(text);

  result.location.address = addressData.address;
  result.location.street = addressData.street;
  result.location.postalCode = addressData.postalCode;
  result.location.city = addressData.city;
  result.location.province = addressData.province;
  result.location.country = "España";

  result.invoice_data.type = detectBillType(text);
  result.invoice_data.consumptionKwh = extractConsumption(text);
  result.invoice_data.averageMonthlyConsumptionKwh = result.invoice_data.consumptionKwh;

  result.invoice_data.periods.P1 = extractPeriod(text, "P1");
  result.invoice_data.periods.P2 = extractPeriod(text, "P2");
  result.invoice_data.periods.P3 = extractPeriod(text, "P3");
  result.invoice_data.periods.P4 = extractPeriod(text, "P4");
  result.invoice_data.periods.P5 = extractPeriod(text, "P5");
  result.invoice_data.periods.P6 = extractPeriod(text, "P6");

  if (!result.invoice_data.averageMonthlyConsumptionKwh && result.invoice_data.consumptionKwh) {
    result.invoice_data.averageMonthlyConsumptionKwh = result.invoice_data.consumptionKwh;
    result.extraction.warnings.push(
      "No se detectó histórico mensual. Se ha usado el consumo visible de la factura."
    );
  }

  if (!result.invoice_data.type) {
    result.extraction.warnings.push("No se pudo determinar con seguridad si la factura es 2TD o 3TD.");
  }

  result.extraction.confidenceScore = estimateConfidence(result);
  result.extraction.extractionMethod = "rules";
  result.extraction.fallbackUsed = true;
  result.extraction.missingFields = listMissingFields(result);

  return result;
}