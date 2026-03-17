import { GoogleGenAI } from "@google/genai";

export type BillType = "2TD" | "3TD" | null;
export type ExtractionMethod = "ai";

type NullableNumber = number | null;

interface PeriodValues {
  P1: NullableNumber;
  P2: NullableNumber;
  P3: NullableNumber;
  P4: NullableNumber;
  P5: NullableNumber;
  P6: NullableNumber;
}

export interface ExtractedBillData {
  customer: {
    fullName: string | null;
    name: string | null;
    lastname1: string | null;
    lastname2: string | null;
    surnames: string | null;
    dni: string | null;
    cups: string | null;
    iban: string | null; // preserva asteriscos si vienen en la factura
    ibanNeedsCompletion: boolean;
    email: string | null;
    phone: string | null;
  };
  location: {
    address: string | null; // dirección completa
    street: string | null;
    postalCode: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
  };
  invoice_data: {
    type: BillType;
    billedDays: number | null;
    consumptionKwh: number | null; // compatibilidad: consumo total de esta factura
    currentInvoiceConsumptionKwh: number | null;
    averageMonthlyConsumptionKwh: number | null;
    periods: PeriodValues; // consumo kWh por periodo
    periodPricesEurPerKwh: PeriodValues; // €/kWh por periodo si aparecen explícitos
    postcodeAverageConsumptionKwh: number | null; // para detectar falsos positivos
  };
  extraction: {
    confidenceScore: number | null;
    missingFields: string[];
    warnings: string[];
    manualReviewFields: string[];
    extractionMethod: ExtractionMethod;
    fallbackUsed: boolean;
  };
}

export interface InvoiceBinaryInput {
  fileName: string;
  mimeType?: string;
  buffer?: Buffer;
  /**
   * Texto ya extraído del PDF con pdf-parse / OCR / regex pipeline.
   * Si existe y tiene suficiente contenido útil, se usa antes que el PDF completo.
   */
  extractedText?: string;
}

type PartialExtraction = Partial<ExtractedBillData>;

const DEFAULT_MODEL =
  process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite";

const ENABLE_TOKEN_DEBUG = process.env.GEMINI_DEBUG_TOKENS === "true";
const MAX_TEXT_CHARS = Number(process.env.GEMINI_MAX_TEXT_CHARS || 18000);

const RELEVANT_INVOICE_REGEX: RegExp =
  /(titular|contrato|nombre|apellid|dni|nif|nie|cups|iban|direcci[oó]n|domicilio|suministro|c[oó]digo postal|postal|provincia|municipio|ciudad|periodo de facturaci[oó]n|dias facturados|consumo total|consumo medio|evoluci[oó]n de consumo|punta|llano|valle|p[1-6]\b|peaje|atr|2\.?0td|3\.?0td|2td|3td|energ[ií]a consumida|€\/kwh|mercado|forma de pago)/i;
const extractionResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    customer: {
      type: "object",
      additionalProperties: false,
      properties: {
        fullName: { type: "string", nullable: true },
        name: { type: "string", nullable: true },
        lastname1: { type: "string", nullable: true },
        lastname2: { type: "string", nullable: true },
        surnames: { type: "string", nullable: true },
        dni: { type: "string", nullable: true },
        cups: { type: "string", nullable: true },
        iban: { type: "string", nullable: true },
        ibanNeedsCompletion: { type: "boolean" },
        email: { type: "string", nullable: true },
        phone: { type: "string", nullable: true },
      },
      required: [
        "fullName",
        "name",
        "lastname1",
        "lastname2",
        "surnames",
        "dni",
        "cups",
        "iban",
        "ibanNeedsCompletion",
        "email",
        "phone",
      ],
    },
    location: {
      type: "object",
      additionalProperties: false,
      properties: {
        address: { type: "string", nullable: true },
        street: { type: "string", nullable: true },
        postalCode: { type: "string", nullable: true },
        city: { type: "string", nullable: true },
        province: { type: "string", nullable: true },
        country: { type: "string", nullable: true },
      },
      required: [
        "address",
        "street",
        "postalCode",
        "city",
        "province",
        "country",
      ],
    },
    invoice_data: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: {
          anyOf: [{ type: "string", enum: ["2TD", "3TD"] }, { type: "null" }],
        },
        billedDays: { type: "number", nullable: true },
        consumptionKwh: { type: "number", nullable: true },
        currentInvoiceConsumptionKwh: { type: "number", nullable: true },
        averageMonthlyConsumptionKwh: { type: "number", nullable: true },
        postcodeAverageConsumptionKwh: { type: "number", nullable: true },
        periods: {
          type: "object",
          additionalProperties: false,
          properties: {
            P1: { type: "number", nullable: true },
            P2: { type: "number", nullable: true },
            P3: { type: "number", nullable: true },
            P4: { type: "number", nullable: true },
            P5: { type: "number", nullable: true },
            P6: { type: "number", nullable: true },
          },
          required: ["P1", "P2", "P3", "P4", "P5", "P6"],
        },
        periodPricesEurPerKwh: {
          type: "object",
          additionalProperties: false,
          properties: {
            P1: { type: "number", nullable: true },
            P2: { type: "number", nullable: true },
            P3: { type: "number", nullable: true },
            P4: { type: "number", nullable: true },
            P5: { type: "number", nullable: true },
            P6: { type: "number", nullable: true },
          },
          required: ["P1", "P2", "P3", "P4", "P5", "P6"],
        },
      },
      required: [
        "type",
        "billedDays",
        "consumptionKwh",
        "currentInvoiceConsumptionKwh",
        "averageMonthlyConsumptionKwh",
        "postcodeAverageConsumptionKwh",
        "periods",
        "periodPricesEurPerKwh",
      ],
    },
    extraction: {
      type: "object",
      additionalProperties: false,
      properties: {
        confidenceScore: { type: "number", nullable: true },
        missingFields: {
          type: "array",
          items: { type: "string" },
        },
        warnings: {
          type: "array",
          items: { type: "string" },
        },
        manualReviewFields: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: [
        "confidenceScore",
        "missingFields",
        "warnings",
        "manualReviewFields",
      ],
    },
  },
  required: ["customer", "location", "invoice_data", "extraction"],
} as const;

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || "";

  if (!apiKey) {
    throw new Error("Falta GEMINI_API_KEY en el archivo .env");
  }

  return new GoogleGenAI({ apiKey });
}

function isQuotaError(error: any): boolean {
  return (
    error?.status === 429 ||
    error?.error?.code === 429 ||
    String(error?.message || "").includes("RESOURCE_EXHAUSTED") ||
    String(error?.message || "")
      .toLowerCase()
      .includes("quota")
  );
}

function bufferToBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

function emptyPeriods(): PeriodValues {
  return {
    P1: null,
    P2: null,
    P3: null,
    P4: null,
    P5: null,
    P6: null,
  };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = normalizeWhitespace(value);
  return trimmed.length > 0 ? trimmed : null;
}

function parseSpanishNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;

  let value = raw.trim();
  if (!value) return null;

  value = value.replace(/[^\d,.-]/g, "");

  if (!value) return null;

  const hasComma = value.includes(",");
  const hasDot = value.includes(".");

  if (hasComma && hasDot) {
    // 1.234,56 => 1234.56
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    // 224,84 => 224.84
    value = value.replace(",", ".");
  } else if (hasDot) {
    // 1.088 => 1088 ; 0.18508 => 0.18508
    if (/^\d{1,3}(\.\d{3})+$/.test(value)) {
      value = value.replace(/\./g, "");
    }
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeNumber(value: unknown): number | null {
  return parseSpanishNumber(value);
}

function normalizeBillType(value: unknown): BillType {
  if (typeof value !== "string") return null;

  const normalized = value.replace(/\s+/g, "").toUpperCase();

  if (normalized === "2TD" || normalized === "2.0TD") return "2TD";
  if (normalized === "3TD" || normalized === "3.0TD") return "3TD";

  return null;
}

function normalizeDni(value: unknown): string | null {
  const str = safeString(value);
  if (!str) return null;
  return str.replace(/\s+/g, "").toUpperCase();
}

function normalizeCups(value: unknown): string | null {
  const str = safeString(value);
  if (!str) return null;
  return str.replace(/\s+/g, "").toUpperCase();
}

function normalizeIbanPreservingMask(value: unknown): string | null {
  const str = safeString(value);
  if (!str) return null;

  return str
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/(\*{2,})/g, (m) => m);
}

function ibanNeedsCompletion(iban: string | null): boolean {
  return !!iban && iban.includes("*");
}

function normalizePhone(value: unknown): string | null {
  const str = safeString(value);
  if (!str) return null;
  return str.replace(/\s+/g, "");
}

function extractResponseText(response: unknown): string {
  const maybeResponse = response as
    | { text?: string | (() => string) }
    | undefined;

  if (!maybeResponse?.text) return "";

  if (typeof maybeResponse.text === "function") {
    return maybeResponse.text().trim();
  }

  if (typeof maybeResponse.text === "string") {
    return maybeResponse.text.trim();
  }

  return "";
}

function compactInvoiceText(rawText?: string): string {
  if (!rawText) return "";

  const lines = rawText
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (!lines.length) return "";

  const selected = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] ?? "");

    if (RELEVANT_INVOICE_REGEX.test(line)) {
      for (
        let j = Math.max(0, i - 2);
        j <= Math.min(lines.length - 1, i + 2);
        j++
      ) {
        selected.add(j);
      }
    }
  }
  const compacted = (
    selected.size > 0
      ? [...selected]
          .sort((a, b) => a - b)
          .map((i) => lines[i])
          .join("\n")
      : lines.join("\n")
  ).slice(0, MAX_TEXT_CHARS);

  return compacted;
}

function buildPrompt(fileName: string, sourceMode: "text" | "pdf"): string {
  return [
    "Analiza esta factura eléctrica española y devuelve solo JSON válido ajustado al schema.",
    "No inventes datos. Si un dato no aparece con claridad, devuelve null.",
    "Muy importante:",
    "- customer.fullName debe ser el titular real, nunca una etiqueta.",
    "- Si puedes separar nombre y apellidos, hazlo. Si no, usa fullName y añade warning.",
    "- No uses emails, teléfonos o direcciones de atención al cliente de la comercializadora como datos del titular.",
    "- location.address debe ser la dirección completa de suministro.",
    "- customer.iban debe conservar los asteriscos si el IBAN está enmascarado.",
    "- customer.ibanNeedsCompletion debe ser true si el IBAN lleva asteriscos.",
    "- invoice_data.type solo puede ser 2TD, 3TD o null.",
    "- invoice_data.currentInvoiceConsumptionKwh y invoice_data.consumptionKwh deben ser el consumo total de ESTA factura.",
    "- invoice_data.averageMonthlyConsumptionKwh debe intentar calcularse a partir del histórico/gráfica si es visible; si no se puede, usa una estimación mensual a partir del consumo total y los días facturados.",
    "- invoice_data.postcodeAverageConsumptionKwh debe recoger el dato de consumo medio del código postal si aparece.",
    "- Para 2TD: punta=P1, llano=P2, valle=P3; P4, P5 y P6 deben ser null.",
    "- periodPricesEurPerKwh.P1..P6 solo deben rellenarse si la factura muestra explícitamente €/kWh por periodo tarifario. Si no aparece explícito por periodo, deja null.",
    "- No confundas el consumo medio del código postal con el consumo medio mensual del cliente.",
    sourceMode === "text"
      ? "La entrada es texto extraído del PDF; ignora ruido obvio de OCR."
      : "La entrada es el PDF original.",
    `Archivo: ${fileName}`,
  ].join("\n");
}

function splitFullName(fullName: string | null): {
  fullName: string | null;
  name: string | null;
  lastname1: string | null;
  lastname2: string | null;
  surnames: string | null;
} {
  if (!fullName) {
    return {
      fullName: null,
      name: null,
      lastname1: null,
      lastname2: null,
      surnames: null,
    };
  }

  const clean = normalizeWhitespace(fullName);
  const parts = clean.split(" ").filter(Boolean);

  if (parts.length === 1) {
    return {
      fullName: clean,
      name: parts[0],
      lastname1: null,
      lastname2: null,
      surnames: null,
    };
  }

  const name = parts[0];
  const surnameParts = parts.slice(1);

  return {
    fullName: clean,
    name,
    lastname1: surnameParts[0] ?? null,
    lastname2: surnameParts.length > 1 ? surnameParts.slice(1).join(" ") : null,
    surnames: surnameParts.length ? surnameParts.join(" ") : null,
  };
}

function isUtilityEmail(value: string | null): boolean {
  if (!value) return false;
  const v = value.toLowerCase().trim();
  return (
    v.includes("iberdrola.es") ||
    v.includes("tuiberdrola.es") ||
    v.includes("i-de.es")
  );
}

function isUtilityPhone(value: string | null): boolean {
  if (!value) return false;
  const phone = value.replace(/\s+/g, "");
  return [
    "900225235",
    "960882467",
    "900171171",
    "900224522",
    "960882468",
    "963866000",
  ].includes(phone);
}

function estimateMonthlyConsumption(
  totalKwh: number | null,
  billedDays: number | null,
): number | null {
  if (totalKwh == null || billedDays == null || billedDays <= 0) return null;
  return Number(((totalKwh / billedDays) * 30.4375).toFixed(2));
}

function parseAddressParts(fullAddress: string | null): {
  address: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
} {
  const address = safeString(fullAddress);
  if (!address) {
    return {
      address: null,
      street: null,
      postalCode: null,
      city: null,
      province: null,
      country: "España",
    };
  }

  const normalized = normalizeWhitespace(address);
  const postalCodeMatch = normalized.match(/\b(\d{5})\b/);
  const provinceMatch = normalized.match(/\(([^)]+)\)\s*$/);
  const postalCode = postalCodeMatch?.[1] ?? null;
  const province = provinceMatch?.[1]?.trim() ?? null;

  let city: string | null = null;

  if (postalCode) {
    const afterPostal = normalized.split(postalCode)[1] ?? "";
    const beforeProvince = province
      ? afterPostal.replace(
          new RegExp(
            `\\(${province.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)\\s*$`,
          ),
          "",
        )
      : afterPostal;

    city = safeString(beforeProvince.replace(/^[,\s-]+/, ""));
  }

  let street = normalized;
  if (postalCode) {
    street = normalized.split(postalCode)[0]?.trim() ?? normalized;
  }

  return {
    address: normalized,
    street: street || null,
    postalCode,
    city,
    province,
    country: "España",
  };
}

function listMissingFields(data: ExtractedBillData): string[] {
  const missing: string[] = [];

  if (!data.customer.fullName) missing.push("customer.fullName");
  if (!data.customer.name) missing.push("customer.name");
  if (!data.customer.dni) missing.push("customer.dni");
  if (!data.customer.cups) missing.push("customer.cups");
  if (!data.customer.iban) missing.push("customer.iban");

  if (!data.location.address) missing.push("location.address");
  if (!data.location.postalCode) missing.push("location.postalCode");
  if (!data.location.city) missing.push("location.city");
  if (!data.location.province) missing.push("location.province");

  if (!data.invoice_data.type) missing.push("invoice_data.type");
  if (data.invoice_data.currentInvoiceConsumptionKwh == null) {
    missing.push("invoice_data.currentInvoiceConsumptionKwh");
  }
  if (data.invoice_data.averageMonthlyConsumptionKwh == null) {
    missing.push("invoice_data.averageMonthlyConsumptionKwh");
  }

  const { P1, P2, P3, P4, P5, P6 } = data.invoice_data.periods;

  if (P1 == null) missing.push("invoice_data.periods.P1");
  if (P2 == null) missing.push("invoice_data.periods.P2");
  if (P3 == null) missing.push("invoice_data.periods.P3");

  if (data.invoice_data.type === "3TD") {
    if (P4 == null) missing.push("invoice_data.periods.P4");
    if (P5 == null) missing.push("invoice_data.periods.P5");
    if (P6 == null) missing.push("invoice_data.periods.P6");
  }

  return missing;
}

function extractRegexValue(text: string, regex: RegExp): string | null {
  const match = text.match(regex);
  if (!match?.[1]) return null;
  return normalizeWhitespace(match[1]);
}

function extractFullNameFromText(text: string): string | null {
  const byTitular = extractRegexValue(
    text,
    /Titular(?:\s+Potencia)?:\s*([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s.'-]{3,}?)(?:\s+Potencia punta:|\n)/i,
  );
  if (byTitular) return byTitular;

  return null;
}

function extractSupplyAddress(text: string): string | null {
  const block = text.match(
    /Dirección de suministro:\s*([\s\S]{0,180}?)(?:Nº DE CONTRATO|RESUMEN DE FACTURA|NIF titular del contrato|Número de contrato de acceso|Forma de pago)/i,
  );

  if (!block?.[1]) return null;

  return normalizeWhitespace(block[1]);
}

function extractPeriodConsumptions(
  text: string,
  billType: BillType,
): PeriodValues {
  const periods = emptyPeriods();

  const puntaLlanoValle = text.match(
    /Sus consumos desagregados han sido\s+punta:\s*([\d.,]+)\s*kWh;\s*llano:\s*([\d.,]+)\s*kWh;\s*valle\s*:?\s*([\d.,]+)\s*kWh/i,
  );

  if (puntaLlanoValle) {
    periods.P1 = parseSpanishNumber(puntaLlanoValle[1]);
    periods.P2 = parseSpanishNumber(puntaLlanoValle[2]);
    periods.P3 = parseSpanishNumber(puntaLlanoValle[3]);

    if (billType === "2TD") {
      periods.P4 = null;
      periods.P5 = null;
      periods.P6 = null;
    }
    return periods;
  }

  const explicitPeriods = [
    ...text.matchAll(/\bP([1-6])\b[\s:=-]*([\d.,]+)\s*kWh/gi),
  ];
  for (const match of explicitPeriods) {
    const key = `P${match[1]}` as keyof PeriodValues;
    periods[key] = parseSpanishNumber(match[2]);
  }

  return periods;
}

function extractPeriodPrices(text: string): PeriodValues {
  const prices = emptyPeriods();

  for (let i = 1; i <= 6; i++) {
    const regex = new RegExp(
      `\\bP${i}\\b[\\s\\S]{0,40}?([\\d.,]+)\\s*€\\/kWh`,
      "i",
    );
    const match = text.match(regex);
    if (match?.[1]) {
      prices[`P${i}` as keyof PeriodValues] = parseSpanishNumber(match[1]);
    }
  }

  return prices;
}

function extractLocalDataFromText(text?: string): PartialExtraction {
  const source = text ? text.replace(/\r/g, "\n") : "";
  if (!source.trim()) return {};

  const fullName = extractFullNameFromText(source);
  const splitName = splitFullName(fullName);

  const address = extractSupplyAddress(source);
  const addressParts = parseAddressParts(address);

  const dni = extractRegexValue(
    source,
    /NIF titular del contrato:\s*([A-Z0-9]+)\b/i,
  );

  const cups = extractRegexValue(
    source,
    /Identificación punto de suministro \(CUPS\):\s*([A-Z0-9\s]+)\b/i,
  );

  const iban = extractRegexValue(
    source,
    /IBAN:\s*([A-Z]{2}\s*\d{2}(?:\s*[\d*]{4}){4,5})/i,
  );

  const type = extractRegexValue(
    source,
    /Peaje de acceso a la red \(ATR\):\s*(2(?:\.0)?TD|3(?:\.0)?TD)\b/i,
  );

  const billedDays = parseSpanishNumber(
    extractRegexValue(source, /DIAS FACTURADOS:\s*(\d{1,3})\b/i),
  );

  const totalConsumption = parseSpanishNumber(
    extractRegexValue(
      source,
      /Consumo total de\s+esta factura\.\s*([\d.,]+)\s*kWh/i,
    ),
  );

  const postcodeAverage = parseSpanishNumber(
    extractRegexValue(
      source,
      /consumo medio de electricidad de los suministros en su mismo código postal ha sido de\s*([\d.,]+)\s*kWh/i,
    ),
  );

  const normalizedType = normalizeBillType(type);
  const periods = extractPeriodConsumptions(source, normalizedType);
  const periodPrices = extractPeriodPrices(source);

  const estimatedMonthly = estimateMonthlyConsumption(
    totalConsumption,
    billedDays,
  );

  return {
    customer: {
      fullName: splitName.fullName,
      name: splitName.name,
      lastname1: splitName.lastname1,
      lastname2: splitName.lastname2,
      surnames: splitName.surnames,
      dni: normalizeDni(dni),
      cups: normalizeCups(cups),
      iban: normalizeIbanPreservingMask(iban),
      ibanNeedsCompletion: ibanNeedsCompletion(
        normalizeIbanPreservingMask(iban),
      ),
      email: null,
      phone: null,
    },
    location: {
      ...addressParts,
    },
    invoice_data: {
      type: normalizedType,
      billedDays,
      consumptionKwh: totalConsumption,
      currentInvoiceConsumptionKwh: totalConsumption,
      averageMonthlyConsumptionKwh: estimatedMonthly,
      postcodeAverageConsumptionKwh: postcodeAverage,
      periods,
      periodPricesEurPerKwh: periodPrices,
    },
  };
}

function mergePeriods(
  primary?: PeriodValues,
  secondary?: PeriodValues,
): PeriodValues {
  const result = emptyPeriods();
  for (const key of ["P1", "P2", "P3", "P4", "P5", "P6"] as const) {
    result[key] = primary?.[key] ?? secondary?.[key] ?? null;
  }
  return result;
}

function normalizeExtraction(data: any): ExtractedBillData {
  const fullName = safeString(data?.customer?.fullName);
  const splitName = splitFullName(fullName);

  const normalizedAddress = safeString(data?.location?.address);
  const addressParts = parseAddressParts(normalizedAddress);

  const iban = normalizeIbanPreservingMask(data?.customer?.iban);
  let email = safeString(data?.customer?.email);
  let phone = normalizePhone(data?.customer?.phone);

  if (isUtilityEmail(email)) email = null;
  if (isUtilityPhone(phone)) phone = null;

  const type = normalizeBillType(data?.invoice_data?.type);

  const normalized: ExtractedBillData = {
    customer: {
      fullName: fullName ?? null,
      name: safeString(data?.customer?.name) ?? splitName.name,
      lastname1: safeString(data?.customer?.lastname1) ?? splitName.lastname1,
      lastname2: safeString(data?.customer?.lastname2) ?? splitName.lastname2,
      surnames: safeString(data?.customer?.surnames) ?? splitName.surnames,
      dni: normalizeDni(data?.customer?.dni),
      cups: normalizeCups(data?.customer?.cups),
      iban,
      ibanNeedsCompletion:
        typeof data?.customer?.ibanNeedsCompletion === "boolean"
          ? data.customer.ibanNeedsCompletion || ibanNeedsCompletion(iban)
          : ibanNeedsCompletion(iban),
      email,
      phone,
    },
    location: {
      address: normalizedAddress ?? null,
      street: safeString(data?.location?.street) ?? addressParts.street,
      postalCode:
        safeString(data?.location?.postalCode) ?? addressParts.postalCode,
      city: safeString(data?.location?.city) ?? addressParts.city,
      province: safeString(data?.location?.province) ?? addressParts.province,
      country: safeString(data?.location?.country) ?? "España",
    },
    invoice_data: {
      type,
      billedDays: safeNumber(data?.invoice_data?.billedDays),
      consumptionKwh: safeNumber(data?.invoice_data?.consumptionKwh),
      currentInvoiceConsumptionKwh:
        safeNumber(data?.invoice_data?.currentInvoiceConsumptionKwh) ??
        safeNumber(data?.invoice_data?.consumptionKwh),
      averageMonthlyConsumptionKwh: safeNumber(
        data?.invoice_data?.averageMonthlyConsumptionKwh,
      ),
      postcodeAverageConsumptionKwh: safeNumber(
        data?.invoice_data?.postcodeAverageConsumptionKwh,
      ),
      periods: {
        P1: safeNumber(data?.invoice_data?.periods?.P1),
        P2: safeNumber(data?.invoice_data?.periods?.P2),
        P3: safeNumber(data?.invoice_data?.periods?.P3),
        P4: safeNumber(data?.invoice_data?.periods?.P4),
        P5: safeNumber(data?.invoice_data?.periods?.P5),
        P6: safeNumber(data?.invoice_data?.periods?.P6),
      },
      periodPricesEurPerKwh: {
        P1: safeNumber(data?.invoice_data?.periodPricesEurPerKwh?.P1),
        P2: safeNumber(data?.invoice_data?.periodPricesEurPerKwh?.P2),
        P3: safeNumber(data?.invoice_data?.periodPricesEurPerKwh?.P3),
        P4: safeNumber(data?.invoice_data?.periodPricesEurPerKwh?.P4),
        P5: safeNumber(data?.invoice_data?.periodPricesEurPerKwh?.P5),
        P6: safeNumber(data?.invoice_data?.periodPricesEurPerKwh?.P6),
      },
    },
    extraction: {
      confidenceScore: safeNumber(data?.extraction?.confidenceScore),
      missingFields: Array.isArray(data?.extraction?.missingFields)
        ? data.extraction.missingFields.filter(
            (item: unknown) => typeof item === "string",
          )
        : [],
      warnings: Array.isArray(data?.extraction?.warnings)
        ? data.extraction.warnings.filter(
            (item: unknown) => typeof item === "string",
          )
        : [],
      manualReviewFields: Array.isArray(data?.extraction?.manualReviewFields)
        ? data.extraction.manualReviewFields.filter(
            (item: unknown) => typeof item === "string",
          )
        : [],
      extractionMethod: "ai",
      fallbackUsed: false,
    },
  };

  if (normalized.customer.ibanNeedsCompletion) {
    normalized.extraction.manualReviewFields.push("customer.iban");
    normalized.extraction.warnings.push(
      "El IBAN viene oculto parcialmente en la factura. El cliente debe completar los dígitos enmascarados.",
    );
  }

  if (
    normalized.invoice_data.type === "2TD" &&
    (normalized.invoice_data.periods.P4 != null ||
      normalized.invoice_data.periods.P5 != null ||
      normalized.invoice_data.periods.P6 != null)
  ) {
    normalized.invoice_data.periods.P4 = null;
    normalized.invoice_data.periods.P5 = null;
    normalized.invoice_data.periods.P6 = null;
  }

  normalized.extraction.missingFields = listMissingFields(normalized);

  return normalized;
}

function mergeExtractions(
  aiData: ExtractedBillData,
  localData: PartialExtraction,
): ExtractedBillData {
  const merged: ExtractedBillData = {
    customer: {
      fullName: localData.customer?.fullName ?? aiData.customer.fullName,
      name: localData.customer?.name ?? aiData.customer.name,
      lastname1: localData.customer?.lastname1 ?? aiData.customer.lastname1,
      lastname2: localData.customer?.lastname2 ?? aiData.customer.lastname2,
      surnames: localData.customer?.surnames ?? aiData.customer.surnames,
      dni: localData.customer?.dni ?? aiData.customer.dni,
      cups: localData.customer?.cups ?? aiData.customer.cups,
      iban: localData.customer?.iban ?? aiData.customer.iban,
      ibanNeedsCompletion:
        localData.customer?.ibanNeedsCompletion ??
        aiData.customer.ibanNeedsCompletion,
      email: localData.customer?.email ?? aiData.customer.email,
      phone: localData.customer?.phone ?? aiData.customer.phone,
    },
    location: {
      address: localData.location?.address ?? aiData.location.address,
      street: localData.location?.street ?? aiData.location.street,
      postalCode: localData.location?.postalCode ?? aiData.location.postalCode,
      city: localData.location?.city ?? aiData.location.city,
      province: localData.location?.province ?? aiData.location.province,
      country: localData.location?.country ?? aiData.location.country,
    },
    invoice_data: {
      type: localData.invoice_data?.type ?? aiData.invoice_data.type,
      billedDays:
        localData.invoice_data?.billedDays ?? aiData.invoice_data.billedDays,
      consumptionKwh:
        localData.invoice_data?.consumptionKwh ??
        aiData.invoice_data.consumptionKwh,
      currentInvoiceConsumptionKwh:
        localData.invoice_data?.currentInvoiceConsumptionKwh ??
        aiData.invoice_data.currentInvoiceConsumptionKwh,
      averageMonthlyConsumptionKwh:
        aiData.invoice_data.averageMonthlyConsumptionKwh ??
        localData.invoice_data?.averageMonthlyConsumptionKwh ??
        null,
      postcodeAverageConsumptionKwh:
        localData.invoice_data?.postcodeAverageConsumptionKwh ??
        aiData.invoice_data.postcodeAverageConsumptionKwh,
      periods: mergePeriods(
        localData.invoice_data?.periods,
        aiData.invoice_data.periods,
      ),
      periodPricesEurPerKwh: mergePeriods(
        aiData.invoice_data.periodPricesEurPerKwh,
        localData.invoice_data?.periodPricesEurPerKwh,
      ),
    },
    extraction: {
      confidenceScore: aiData.extraction.confidenceScore,
      missingFields: [],
      warnings: [...aiData.extraction.warnings],
      manualReviewFields: [...aiData.extraction.manualReviewFields],
      extractionMethod: "ai",
      fallbackUsed: aiData.extraction.fallbackUsed,
    },
  };

  // Reglas duras: jamás coger email/teléfono de Iberdrola como cliente
  if (isUtilityEmail(merged.customer.email)) {
    merged.customer.email = null;
    merged.extraction.warnings.push(
      "El email visible en la factura pertenece a la comercializadora y no al titular.",
    );
  }

  if (isUtilityPhone(merged.customer.phone)) {
    merged.customer.phone = null;
    merged.extraction.warnings.push(
      "El teléfono visible en la factura pertenece a la comercializadora y no al titular.",
    );
  }

  // Si la IA confunde el promedio del código postal con el promedio del cliente, lo corregimos
  const postcodeAverage = merged.invoice_data.postcodeAverageConsumptionKwh;
  const aiAverage = merged.invoice_data.averageMonthlyConsumptionKwh;

  if (
    postcodeAverage != null &&
    aiAverage != null &&
    Math.abs(aiAverage - postcodeAverage) < 0.01
  ) {
    merged.invoice_data.averageMonthlyConsumptionKwh =
      estimateMonthlyConsumption(
        merged.invoice_data.currentInvoiceConsumptionKwh,
        merged.invoice_data.billedDays,
      );

    merged.extraction.warnings.push(
      "Se ha ignorado el consumo medio del código postal y se ha estimado el consumo medio mensual del cliente a partir del periodo facturado.",
    );
  }

  // Fallback mensual si sigue vacío
  if (merged.invoice_data.averageMonthlyConsumptionKwh == null) {
    merged.invoice_data.averageMonthlyConsumptionKwh =
      estimateMonthlyConsumption(
        merged.invoice_data.currentInvoiceConsumptionKwh,
        merged.invoice_data.billedDays,
      );
  }

  // Compatibilidad: consumptionKwh = currentInvoiceConsumptionKwh
  if (merged.invoice_data.consumptionKwh == null) {
    merged.invoice_data.consumptionKwh =
      merged.invoice_data.currentInvoiceConsumptionKwh;
  }

  if (merged.customer.ibanNeedsCompletion) {
    if (!merged.extraction.manualReviewFields.includes("customer.iban")) {
      merged.extraction.manualReviewFields.push("customer.iban");
    }
  }

  // Si no hay precios explícitos por periodo, los dejamos en null y avisamos
  const allPeriodPricesNull = Object.values(
    merged.invoice_data.periodPricesEurPerKwh,
  ).every((value) => value == null);

  if (allPeriodPricesNull) {
    merged.extraction.warnings.push(
      "La factura no muestra €/kWh explícitos por P1/P2/P3/P4/P5/P6. Esos campos se devuelven en null.",
    );
    merged.extraction.manualReviewFields.push(
      "invoice_data.periodPricesEurPerKwh",
    );
  }

  merged.extraction.missingFields = listMissingFields(merged);
  merged.extraction.warnings = [...new Set(merged.extraction.warnings)];
  merged.extraction.manualReviewFields = [
    ...new Set(merged.extraction.manualReviewFields),
  ];

  return merged;
}

function buildContents(input: InvoiceBinaryInput): {
  contents: Array<{
    role: "user";
    parts: Array<Record<string, unknown>>;
  }>;
  sourceMode: "text" | "pdf";
} {
  const compactedText = compactInvoiceText(input.extractedText);

  if (compactedText.length >= 200) {
    return {
      sourceMode: "text",
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt(input.fileName, "text") },
            {
              text: `TEXTO_FACTURA:\n${compactedText}`,
            },
          ],
        },
      ],
    };
  }

  if (input.buffer?.length && input.mimeType) {
    return {
      sourceMode: "pdf",
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt(input.fileName, "pdf") },
            {
              inlineData: {
                mimeType: input.mimeType,
                data: bufferToBase64(input.buffer),
              },
            },
          ],
        },
      ],
    };
  }

  throw new Error(
    "No se ha recibido ni texto extraído útil ni contenido binario válido de la factura",
  );
}

function buildConfig(model: string) {
  const config: Record<string, unknown> = {
    responseMimeType: "application/json",
    responseSchema: extractionResponseSchema as any,
    temperature: 0,
    candidateCount: 1,
    maxOutputTokens: 1400,
  };

  if (model.startsWith("gemini-2.5")) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }

  return config;
}

async function callGemini(
  ai: GoogleGenAI,
  model: string,
  input: InvoiceBinaryInput,
) {
  const { contents, sourceMode } = buildContents(input);
  const config = buildConfig(model);

  if (ENABLE_TOKEN_DEBUG) {
    try {
      const estimated = await ai.models.countTokens({
        model,
        contents,
      });

      console.info("[Gemini][countTokens]", {
        model,
        fileName: input.fileName,
        sourceMode,
        estimatedPromptTokens: estimated.totalTokens ?? null,
        cachedContentTokenCount: estimated.cachedContentTokenCount ?? 0,
      });
    } catch (error) {
      console.warn("[Gemini][countTokens] No se pudo calcular:", error);
    }
  }

  const response = await ai.models.generateContent({
    model,
    contents,
    config,
  });

  const usage = (response as any)?.usageMetadata;
  const finishReason = (response as any)?.candidates?.[0]?.finishReason ?? null;

  console.info("[Gemini][usageMetadata]", {
    model,
    fileName: input.fileName,
    sourceMode,
    finishReason,
    promptTokenCount: usage?.promptTokenCount ?? null,
    candidatesTokenCount: usage?.candidatesTokenCount ?? null,
    thoughtsTokenCount: usage?.thoughtsTokenCount ?? 0,
    totalTokenCount: usage?.totalTokenCount ?? null,
  });

  return response;
}

export async function extractDataFromBill(
  input: InvoiceBinaryInput,
): Promise<ExtractedBillData> {
  const ai = getAiClient();
  const model = DEFAULT_MODEL;

  try {
    const response = await callGemini(ai, model, input);
    const rawText = extractResponseText(response);

    if (!rawText) {
      throw new Error("Gemini no devolvió contenido");
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      console.error("Respuesta cruda de Gemini:", rawText);
      throw new Error("La respuesta de Gemini no es JSON válido");
    }

    const aiExtraction = normalizeExtraction(parsed);
    const localExtraction = extractLocalDataFromText(input.extractedText);

    return mergeExtractions(aiExtraction, localExtraction);
  } catch (error: any) {
    const raw = error?.message || error?.toString?.() || "";

    console.error("Error en extracción de factura con IA:", raw);

    if (isQuotaError(error) || raw.includes('"code":429')) {
      throw new Error(
        "La extracción automática no está disponible ahora mismo porque la cuota del modelo Gemini actual está agotada o no permitida. Revisa el modelo configurado, la facturación o las cuotas del proyecto en Google AI Studio.",
      );
    }

    throw new Error(
      "No se pudo completar la extracción automática de la factura.",
    );
  }
}
