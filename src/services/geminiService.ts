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
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

const extractionResponseSchema = {
  type: "object",
  properties: {
    customer: {
      type: "object",
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
      properties: {
        type: {
          anyOf: [{ type: "string", enum: ["2TD", "3TD"] }, { type: "null" }],
        },
        consumptionKwh: { type: "number", nullable: true },
        averageMonthlyConsumptionKwh: { type: "number", nullable: true },
        periods: {
          type: "object",
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

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || "";

  console.log("GEMINI_API_KEY cargada:", Boolean(apiKey));
  console.log("Longitud GEMINI_API_KEY:", apiKey.length);

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
  if (!data.invoice_data.consumptionKwh) {
    missing.push("invoice_data.consumptionKwh");
  }
  if (!data.invoice_data.averageMonthlyConsumptionKwh) {
    missing.push("invoice_data.averageMonthlyConsumptionKwh");
  }

  const { P1, P2, P3, P4, P5, P6 } = data.invoice_data.periods;

  if (!P1) missing.push("invoice_data.periods.P1");
  if (!P2) missing.push("invoice_data.periods.P2");
  if (!P3) missing.push("invoice_data.periods.P3");

  if (data.invoice_data.type === "3TD") {
    if (!P4) missing.push("invoice_data.periods.P4");
    if (!P5) missing.push("invoice_data.periods.P5");
    if (!P6) missing.push("invoice_data.periods.P6");
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
      type:
        data?.invoice_data?.type === "2TD" || data?.invoice_data?.type === "3TD"
          ? data.invoice_data.type
          : null,
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

function buildPrompt(fileName: string): string {
  return `
Eres un sistema experto en extracción de datos de facturas eléctricas españolas.

Debes analizar el documento adjunto y devolver EXCLUSIVAMENTE un JSON válido.
No expliques nada.
No uses markdown.
No inventes datos.
Si un dato no aparece claramente, usa null.

MUY IMPORTANTE:
- No confundas etiquetas con valores.
- Nunca devuelvas como nombre palabras como: "Potencia", "Titular", "Cliente", "Dirección", "CUPS", "IBAN", "Consumo".
- Solo devuelve un nombre real de persona o empresa si está claramente identificado.
- Si no puedes distinguir correctamente el valor, usa null.
- Separa los apellidos en lastname1 y lastname2 si es posible.
- Si solo ves un apellido claro, usa lastname1 y deja lastname2 en null.
- Si la factura pertenece a una empresa y no hay persona identificable, usa customer.name con el nombre comercial y deja apellidos en null.
- La dirección debe ser el valor real completo, no el label del campo.
- El CUPS debe ser un código real.
- El IBAN debe ser un valor real, no una etiqueta.
- El consumo mensual medio debe estimarse a partir de gráficos o históricos si existen.
- Si no se puede calcular el promedio mensual, usa el consumo visible de la factura como referencia.
- Si la tarifa es 2TD, rellena P1, P2 y P3; deja P4, P5 y P6 en null.
- Si la tarifa es 3TD, intenta rellenar P1 a P6.
- Devuelve warnings solo para ambigüedades reales.

Devuelve exactamente esta estructura:

{
  "customer": {
    "name": null,
    "lastname1": null,
    "lastname2": null,
    "dni": null,
    "cups": null,
    "iban": null,
    "email": null,
    "phone": null
  },
  "location": {
    "address": null,
    "street": null,
    "postalCode": null,
    "city": null,
    "province": null,
    "country": "España"
  },
  "invoice_data": {
    "type": null,
    "consumptionKwh": null,
    "averageMonthlyConsumptionKwh": null,
    "periods": {
      "P1": null,
      "P2": null,
      "P3": null,
      "P4": null,
      "P5": null,
      "P6": null
    }
  },
  "extraction": {
    "confidenceScore": null,
    "missingFields": [],
    "warnings": []
  }
}

El nombre del archivo es: ${fileName}
`.trim();
}

export async function extractDataFromBill(
  input: InvoiceBinaryInput,
): Promise<ExtractedBillData> {
  const { buffer, mimeType, fileName } = input;

  if (!buffer || !buffer.length) {
    throw new Error("No se ha recibido contenido de archivo válido");
  }

  const ai = getAiClient();

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [
          { text: buildPrompt(fileName) },
          {
            inlineData: {
              mimeType,
              data: bufferToBase64(buffer),
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: extractionResponseSchema as any,
      temperature: 0.05,
      candidateCount: 1,
      maxOutputTokens: 4096,
    },
  });

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