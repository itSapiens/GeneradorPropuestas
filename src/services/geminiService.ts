import { GoogleGenAI } from "@google/genai";

export type BillType = "2TD" | "3TD" | null;
export type ExtractionMethod = "ai";

export interface ExtractedBillData {
  customer: {
    name: string | null;
    lastname1: string | null;
    lastname2: string | null;
    dni: string | null;
    cups: string | null;
    iban: string | null;
    email: string | null;
    phone: string | null;
  };
  location: {
    address: string | null;
    street: string | null;
    postalCode: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
  };
  invoice_data: {
    type: BillType;
    consumptionKwh: number | null;
    averageMonthlyConsumptionKwh: number | null;
    periods: {
      P1: number | null;
      P2: number | null;
      P3: number | null;
      P4: number | null;
      P5: number | null;
      P6: number | null;
    };
  };
  extraction: {
    confidenceScore: number | null;
    missingFields: string[];
    warnings: string[];
    extractionMethod: ExtractionMethod;
    fallbackUsed: false;
  };
}

export interface InvoiceBinaryInput {
  fileName: string;
  mimeType?: string;
  buffer?: Buffer;
  /**
   * Texto ya extraído del PDF con pdf-parse / OCR / regex pipeline.
   * Si existe y tiene suficiente contenido útil, se usa en lugar del PDF completo.
   */
  extractedText?: string;
}

const DEFAULT_MODEL =
  process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite";

const ENABLE_TOKEN_DEBUG = process.env.GEMINI_DEBUG_TOKENS === "true";
const MAX_TEXT_CHARS = Number(process.env.GEMINI_MAX_TEXT_CHARS || 14000);

const extractionResponseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    customer: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: "string", nullable: true },
        lastname1: { type: "string", nullable: true },
        lastname2: { type: "string", nullable: true },
        dni: { type: "string", nullable: true },
        cups: { type: "string", nullable: true },
        iban: { type: "string", nullable: true },
        email: { type: "string", nullable: true },
        phone: { type: "string", nullable: true },
      },
      required: [
        "name",
        "lastname1",
        "lastname2",
        "dni",
        "cups",
        "iban",
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
        consumptionKwh: { type: "number", nullable: true },
        averageMonthlyConsumptionKwh: { type: "number", nullable: true },
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
      },
      required: [
        "type",
        "consumptionKwh",
        "averageMonthlyConsumptionKwh",
        "periods",
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
      },
      required: ["confidenceScore", "missingFields", "warnings"],
    },
  },
  required: ["customer", "location", "invoice_data", "extraction"],
} as const;

const RELEVANT_INVOICE_LINE =
  /(titular|cliente|raz[oó]n social|nombre|apellid|dni|nif|nie|cups|iban|correo|e-?mail|tel[eé]fono|m[oó]vil|direcci[oó]n|domicilio|municipio|poblaci[oó]n|provincia|c\.?\s*p\.?|c[oó]digo postal|postal|pa[ií]s|tarifa|peaje|2\.?0?\s*td|3\.?0?\s*td|2td|3td|consumo|kwh|periodo|p[1-6]\b|energ[ií]a|hist[oó]rico|suministro|factura|potencia)/i;

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || "";

  if (!apiKey) {
    throw new Error("Falta GEMINI_API_KEY en el archivo .env");
  }

  return new GoogleGenAI({ apiKey });
}

function bufferToBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const normalized = value
      .replace(",", ".")
      .replace(/[^\d.-]/g, "")
      .trim();

    if (!normalized) return null;

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBillType(value: unknown): BillType {
  if (typeof value !== "string") return null;

  const normalized = value.replace(/\s+/g, "").toUpperCase();

  if (normalized === "2TD" || normalized === "2.0TD") return "2TD";
  if (normalized === "3TD" || normalized === "3.0TD") return "3TD";

  return null;
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
    const line = lines[i];

    if (RELEVANT_INVOICE_LINE.test(line)) {
      if (i - 1 >= 0) selected.add(i - 1);
      selected.add(i);
      if (i + 1 < lines.length) selected.add(i + 1);
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
    "Extrae datos de una factura eléctrica española.",
    "Devuelve solo JSON válido ajustado al schema.",
    "No inventes datos: usa null si no aparece con claridad.",
    "customer.name debe ser un nombre real de persona o empresa, nunca una etiqueta.",
    "Separa apellidos solo si se distinguen claramente.",
    "invoice_data.type solo puede ser 2TD, 3TD o null.",
    "Si es 2TD, P4, P5 y P6 deben ser null.",
    "warnings solo para ambigüedades reales.",
    sourceMode === "text"
      ? "La entrada es texto extraído del PDF; ignora ruido obvio de OCR."
      : "La entrada es el PDF original.",
    `Archivo: ${fileName}`,
  ].join("\n");
}

function listMissingFields(data: ExtractedBillData): string[] {
  const missing: string[] = [];

  if (!data.customer.name) missing.push("customer.name");
  if (!data.customer.lastname1) missing.push("customer.lastname1");
  if (!data.customer.lastname2) missing.push("customer.lastname2");
  if (!data.customer.dni) missing.push("customer.dni");
  if (!data.customer.cups) missing.push("customer.cups");
  if (!data.customer.iban) missing.push("customer.iban");

  if (!data.location.address) missing.push("location.address");
  if (!data.location.postalCode) missing.push("location.postalCode");
  if (!data.location.city) missing.push("location.city");
  if (!data.location.province) missing.push("location.province");

  if (!data.invoice_data.type) missing.push("invoice_data.type");
  if (data.invoice_data.consumptionKwh == null) {
    missing.push("invoice_data.consumptionKwh");
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

function normalizeExtraction(data: any): ExtractedBillData {
  const normalized: ExtractedBillData = {
    customer: {
      name: safeString(data?.customer?.name),
      lastname1: safeString(data?.customer?.lastname1),
      lastname2: safeString(data?.customer?.lastname2),
      dni: safeString(data?.customer?.dni),
      cups: safeString(data?.customer?.cups)?.replace(/\s+/g, "") ?? null,
      iban: safeString(data?.customer?.iban)?.replace(/\s+/g, "") ?? null,
      email: safeString(data?.customer?.email),
      phone: safeString(data?.customer?.phone)?.replace(/\s+/g, "") ?? null,
    },
    location: {
      address: safeString(data?.location?.address),
      street: safeString(data?.location?.street),
      postalCode: safeString(data?.location?.postalCode),
      city: safeString(data?.location?.city),
      province: safeString(data?.location?.province),
      country: safeString(data?.location?.country) ?? "España",
    },
    invoice_data: {
      type: normalizeBillType(data?.invoice_data?.type),
      consumptionKwh: safeNumber(data?.invoice_data?.consumptionKwh),
      averageMonthlyConsumptionKwh: safeNumber(
        data?.invoice_data?.averageMonthlyConsumptionKwh,
      ),
      periods: {
        P1: safeNumber(data?.invoice_data?.periods?.P1),
        P2: safeNumber(data?.invoice_data?.periods?.P2),
        P3: safeNumber(data?.invoice_data?.periods?.P3),
        P4: safeNumber(data?.invoice_data?.periods?.P4),
        P5: safeNumber(data?.invoice_data?.periods?.P5),
        P6: safeNumber(data?.invoice_data?.periods?.P6),
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
      extractionMethod: "ai",
      fallbackUsed: false,
    },
  };

  normalized.extraction.missingFields = listMissingFields(normalized);
  return normalized;
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
    responseSchema: extractionResponseSchema,
    temperature: 0,
    candidateCount: 1,
    maxOutputTokens: 1024,
  };

  if (model.startsWith("gemini-2.5")) {
    config.thinkingConfig = { thinkingBudget: 0 };
  }

  return config;
}

export async function extractDataFromBill(
  input: InvoiceBinaryInput,
): Promise<ExtractedBillData> {
  const ai = getAiClient();
  const model = DEFAULT_MODEL;
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
    } catch (error: any) {
      const raw = error?.message || error?.toString?.() || "";

      console.error("Error en extracción de factura con IA:", raw);

      if (isQuotaError(error) || raw.includes('"code":429')) {
        throw new Error(
          "La extracción automática no está disponible ahora mismo porque la cuota del modelo Gemini actual está agotada o no permitida. Cambia a gemini-2.5-flash-lite o revisa la facturación/cuotas del proyecto en Google AI Studio.",
        );
      }

      throw new Error(
        "No se pudo completar la extracción automática de la factura.",
      );
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

  function isQuotaError(error: any): boolean {
    return (
      error?.status === 429 ||
      error?.error?.code === 429 ||
      String(error?.message || "").includes("RESOURCE_EXHAUSTED") ||
      String(error?.message || "").includes("quota")
    );
  }

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

  return normalizeExtraction(parsed);
}
