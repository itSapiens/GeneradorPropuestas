import { GoogleGenAI, Type } from "@google/genai";

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
    consumptionKwh: number | null;
    currentInvoiceConsumptionKwh: number | null;
    averageMonthlyConsumptionKwh: number | null;
    periods: PeriodValues;
    periodPricesEurPerKwh: PeriodValues;
    postcodeAverageConsumptionKwh: number | null;
    invoiceVariableEnergyAmountEur: number | null;

    contractedPowerText: string | null;
    contractedPowerKw: number | null;
    contractedPowerP1: number | null;
    contractedPowerP2: number | null;
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

// Para extracción de facturas escaneadas/OCR, gemini-2.5-flash da bastante
// más precisión que flash-lite a un coste aún muy bajo. Si se quiere volver
// al anterior, basta con setear GEMINI_MODEL=gemini-2.5-flash-lite en el env.
const DEFAULT_MODEL =
  process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

const MAX_TEXT_CHARS = Number(process.env.GEMINI_MAX_TEXT_CHARS || 18000);

// Intentos máximos ante fallos transitorios (5xx, timeouts de red).
// Nunca se reintenta ante 4xx de cliente (schema, payload, etc.) ni ante 429.
const GEMINI_MAX_ATTEMPTS = Number(process.env.GEMINI_MAX_ATTEMPTS || 3);
const GEMINI_RETRY_BASE_MS = Number(process.env.GEMINI_RETRY_BASE_MS || 600);

// Instrucción de sistema: rol persistente que Gemini trata con prioridad y
// que además permite caché de contexto. Mantén aquí las reglas duras; deja
// en el prompt de usuario solo las referencias al archivo concreto.
const SYSTEM_INSTRUCTION = [
  "Eres un extractor experto de facturas eléctricas españolas (tarifas 2.0TD y 3.0TD).",
  "Tu única tarea es leer el contenido de la factura y devolver los datos normalizados siguiendo el JSON Schema que te ha sido proporcionado.",
  "",
  "REGLAS GENERALES:",
  "1. Devuelve SIEMPRE JSON válido conforme al schema. No añadas texto fuera del JSON.",
  "2. Si un dato no aparece o no estás seguro, devuelve null. NO inventes, NO supongas y NO rellenes con datos de ejemplo.",
  "3. Los números deben ir como números JSON (sin símbolos ni unidades), usando PUNTO como separador decimal.",
  "4. Limpia espacios y saltos de línea en los textos.",
  "",
  "TITULAR vs COMERCIALIZADORA:",
  "- El titular es la persona física o empresa contratante del suministro. Normalmente aparece como 'Titular', 'Titular del contrato', 'Nombre del titular' o similar.",
  "- IGNORA cualquier dato (nombre, email, teléfono, dirección) que pertenezca a la comercializadora o distribuidora. Comercializadoras habituales en España: Iberdrola, i-DE, Endesa, Naturgy, Repsol, TotalEnergies, EDP, Holaluz, Octopus Energy, Sapiens Energía, Curenergía, Plenitude, Gana Energía, Audax, Factor Energía.",
  "- Emails tipo @iberdrola.es, @i-de.es, @endesa.com, @naturgy.es, @repsol.com, @edpenergia.es, @holaluz.com, @tuiberdrola.es son SIEMPRE de la comercializadora: pon customer.email = null.",
  "- Teléfonos gratuitos 900/901/902 son habitualmente de atención al cliente: ignóralos salvo confirmación explícita de que son del titular.",
  "",
  "IDENTIFICADORES:",
  "- customer.dni: DNI/NIE/CIF del titular, en MAYÚSCULAS y sin espacios (8 dígitos + letra, o letra + 7 dígitos + letra).",
  "- customer.cups: 20-22 caracteres alfanuméricos en MAYÚSCULAS y sin espacios. Empieza por 'ES'.",
  "- customer.iban: Preserva los asteriscos EXACTAMENTE como aparecen en la factura. Si hay cualquier asterisco, marca ibanNeedsCompletion=true. Si el IBAN no viene oculto, ibanNeedsCompletion=false.",
  "",
  "DIRECCIÓN:",
  "- location.address: dirección COMPLETA del punto de suministro (calle, número, piso, código postal, ciudad, provincia). NO uses la dirección fiscal del titular ni la de la comercializadora.",
  "",
  "TIPO DE TARIFA:",
  "- invoice_data.type: '2TD' para 2.0TD (doméstica/pequeña), '3TD' para 3.0TD (>15kW). Usa null si no se puede determinar.",
  "- Para 2TD los periodos válidos son P1 (punta), P2 (llano), P3 (valle). P4-P6 = null.",
  "- Para 3TD hay 6 periodos (P1..P6).",
  "",
  "CONSUMOS (kWh):",
  "- invoice_data.currentInvoiceConsumptionKwh: consumo total facturado EN ESTA factura.",
  "  Busca textos como: 'Consumo total de esta factura', 'Su consumo en el periodo facturado ha sido X kWh',",
  "  'Energía consumida: X kWh', 'Total energía: X kWh'. IMPORTANTE: es la suma de todos los periodos.",
  "  Si ves 'P1: 120 kWh + P2: 200 kWh + P3: 80 kWh = 400 kWh', el valor correcto es 400.",
  "- invoice_data.consumptionKwh: mismo valor que currentInvoiceConsumptionKwh.",
  "- invoice_data.averageMonthlyConsumptionKwh: déjalo en null. El servidor lo recalcula.",
  "- invoice_data.billedDays: número de días que cubre la factura. Busca 'X días facturados', 'periodo de X días'.",
  "- invoice_data.periods.Pn: consumo en kWh por cada periodo. Para 2TD: P1=punta, P2=llano, P3=valle.",
  "  Busca tablas como 'Punta: X kWh', 'Llano: X kWh', 'Valle: X kWh' o 'P1: X kWh', 'P2: X kWh', etc.",
  "- invoice_data.postcodeAverageConsumptionKwh: consumo medio del código postal SOLO si aparece explícitamente.",
  "",
  "PRECIOS (campo crítico para el cálculo de ahorro solar):",
  "- invoice_data.invoiceVariableEnergyAmountEur: importe NETO (sin IVA) del término de energía consumida.",
  "  Busca líneas como: 'Por energía consumida: XX,XX €', 'Término variable: XX,XX €',",
  "  'Facturación por energía consumida (TÉRMINO VARIABLE): XX,XX €', 'Energía: XX,XX €'.",
  "  IMPORTANTE: Este valor es el importe en EUROS del total de energía (suma de todos los periodos),",
  "  NO el precio unitario €/kWh. Debe ser un número de decenas o cientos de euros (ej: 45.30, 87.20).",
  "  Si solo encuentras el precio unitario €/kWh, ponlo en periodPricesEurPerKwh y deja este campo en null.",
  "  Si no aparece desglosado, devuelve null.",
  "- invoice_data.periodPricesEurPerKwh.Pn: precio unitario en €/kWh por periodo.",
  "  Busca: 'Precio P1: 0,XXXXX €/kWh', tablas de precios, 'Término de energía P1/P2/P3: X €/kWh'.",
  "  IMPORTANTE: son valores pequeños entre 0.05 y 0.40 €/kWh típicamente. Si ves un número >1, es incorrecto.",
  "  Para PVPC: busca 'Precio horario medio P1/P2/P3' o el desglose en la tabla de periodos.",
  "  Para tarifa libre: busca el precio pactado por periodo.",
  "",
  "POTENCIA CONTRATADA:",
  "- Usa la potencia CONTRATADA, NUNCA la potencia máxima demandada.",
  "- Si la factura muestra 'Potencias contratadas: punta-llano X kW; valle Y kW':",
  "    contractedPowerText = texto literal (ej: 'punta-llano 4,600 kW; valle 4,600 kW')",
  "    contractedPowerP1 = X   (punta-llano)",
  "    contractedPowerP2 = Y   (valle)",
  "    contractedPowerKw = X solo si X == Y, en otro caso null",
  "- Si solo hay una potencia (típico en 2.0TD antigua), ponla en contractedPowerKw y deja P1/P2 en null.",
  "",
  "VALIDACIONES INTERNAS ANTES DE RESPONDER:",
  "- Verifica que currentInvoiceConsumptionKwh == sum(periods.P1..P6) si todos los periodos están presentes.",
  "- Verifica que invoiceVariableEnergyAmountEur sea coherente: si consumo=400 kWh e importe=0.15, algo está",
  "  mal (0.15€ para 400 kWh es imposible). El importe debería ser del orden de consumo × 0.10..0.35.",
  "- Verifica que los precios €/kWh estén entre 0.04 y 0.60. Fuera de ese rango, probablemente es un error.",
  "",
  "METADATOS DE EXTRACCIÓN:",
  "- extraction.confidenceScore: número entre 0 y 1. Usa ~0.95 cuando todos los campos clave estén claros, ~0.7 cuando haya OCR ruidoso o campos ambiguos, ~0.4 o menos cuando el documento apenas sea legible.",
  "- extraction.warnings: array con avisos breves relevantes (OCR dudoso, campos contradictorios, factura no eléctrica, precios fuera de rango, etc.).",
  "- extraction.manualReviewFields: array con los campos que dudes. Usa el nombre tal cual aparece en el schema (ej. 'customer.dni', 'invoice_data.type').",
  "- extraction.missingFields: déjalo vacío, lo recalcula el servidor.",
].join("\n");

const RELEVANT_INVOICE_REGEX: RegExp =
  /(titular|contrato|nombre|apellid|dni|nif|nie|cups|iban|direcci[oó]n|domicilio|suministro|c[oó]digo postal|postal|provincia|municipio|ciudad|periodo de facturaci[oó]n|dias facturados|consumo total|consumo medio|evoluci[oó]n de consumo|punta|llano|valle|p[1-6]\b|peaje|atr|2\.?0td|3\.?0td|2td|3td|energ[ií]a consumida|€\/kwh|mercado|forma de pago)/i;

// Schema compatible con Gemini structured output.
// IMPORTANTE: la SDK @google/genai requiere los `type` en MAYÚSCULAS usando
// el enum `Type` (Type.STRING, Type.OBJECT, etc.). No funciona con strings
// tipo JSON Schema en minúsculas ("string", "object"...). Esto fue lo que
// causaba el rechazo silencioso de la API en versiones anteriores.
//
// Reglas de Gemini (https://ai.google.dev/gemini-api/docs/structured-output):
//  - NO se admite `additionalProperties`, `oneOf`, `allOf`, `not`, `$ref`.
//  - Para tipos opcionales se usa `nullable: true`.
//  - Tipos válidos: STRING, NUMBER, INTEGER, BOOLEAN, ARRAY, OBJECT, NULL.
const extractionResponseSchema = {
  type: Type.OBJECT,
  properties: {
    customer: {
      type: Type.OBJECT,
      properties: {
        fullName: { type: Type.STRING, nullable: true },
        name: { type: Type.STRING, nullable: true },
        lastname1: { type: Type.STRING, nullable: true },
        lastname2: { type: Type.STRING, nullable: true },
        surnames: { type: Type.STRING, nullable: true },
        dni: { type: Type.STRING, nullable: true },
        cups: { type: Type.STRING, nullable: true },
        iban: { type: Type.STRING, nullable: true },
        ibanNeedsCompletion: { type: Type.BOOLEAN },
        email: { type: Type.STRING, nullable: true },
        phone: { type: Type.STRING, nullable: true },
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
      type: Type.OBJECT,
      properties: {
        address: { type: Type.STRING, nullable: true },
        street: { type: Type.STRING, nullable: true },
        postalCode: { type: Type.STRING, nullable: true },
        city: { type: Type.STRING, nullable: true },
        province: { type: Type.STRING, nullable: true },
        country: { type: Type.STRING, nullable: true },
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
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          enum: ["2TD", "3TD"],
          nullable: true,
        },
        billedDays: { type: Type.NUMBER, nullable: true },
        consumptionKwh: { type: Type.NUMBER, nullable: true },
        currentInvoiceConsumptionKwh: { type: Type.NUMBER, nullable: true },
        averageMonthlyConsumptionKwh: { type: Type.NUMBER, nullable: true },
        invoiceVariableEnergyAmountEur: { type: Type.NUMBER, nullable: true },
        postcodeAverageConsumptionKwh: { type: Type.NUMBER, nullable: true },

        contractedPowerText: { type: Type.STRING, nullable: true },
        contractedPowerKw: { type: Type.NUMBER, nullable: true },
        contractedPowerP1: { type: Type.NUMBER, nullable: true },
        contractedPowerP2: { type: Type.NUMBER, nullable: true },

        periods: {
          type: Type.OBJECT,
          properties: {
            P1: { type: Type.NUMBER, nullable: true },
            P2: { type: Type.NUMBER, nullable: true },
            P3: { type: Type.NUMBER, nullable: true },
            P4: { type: Type.NUMBER, nullable: true },
            P5: { type: Type.NUMBER, nullable: true },
            P6: { type: Type.NUMBER, nullable: true },
          },
          required: ["P1", "P2", "P3", "P4", "P5", "P6"],
        },
        periodPricesEurPerKwh: {
          type: Type.OBJECT,
          properties: {
            P1: { type: Type.NUMBER, nullable: true },
            P2: { type: Type.NUMBER, nullable: true },
            P3: { type: Type.NUMBER, nullable: true },
            P4: { type: Type.NUMBER, nullable: true },
            P5: { type: Type.NUMBER, nullable: true },
            P6: { type: Type.NUMBER, nullable: true },
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
        "invoiceVariableEnergyAmountEur",
        "contractedPowerText",
        "contractedPowerKw",
        "contractedPowerP1",
        "contractedPowerP2",
      ],
    },
    extraction: {
      type: Type.OBJECT,
      properties: {
        confidenceScore: { type: Type.NUMBER, nullable: true },
        missingFields: { type: Type.ARRAY, items: { type: Type.STRING } },
        warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
        manualReviewFields: { type: Type.ARRAY, items: { type: Type.STRING } },
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
    throw new Error(
      "Falta GEMINI_API_KEY en el archivo .env. Sin esta clave, la extracción IA no puede funcionar.",
    );
  }
  return new GoogleGenAI({ apiKey });
}

function describeGeminiError(error: any): string {
  // Los errores de @google/genai vienen con varias formas según el tipo
  // (HTTP, validación de schema, parsing de JSON, cuota agotada, etc.).
  // Esta función intenta producir un mensaje útil en una sola línea para los logs.
  if (!error) return "Error desconocido (vacío)";

  const status = error.status ?? error.code ?? error?.error?.code;
  const baseMessage =
    error?.error?.message ??
    error?.response?.data?.error?.message ??
    error?.message ??
    String(error);

  if (status) return `[${status}] ${baseMessage}`;
  return baseMessage;
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

/**
 * Errores transitorios que merecen reintento (5xx, timeouts de red,
 * UNAVAILABLE, INTERNAL). Nunca reintentamos 4xx ni 429.
 */
function isTransientError(error: any): boolean {
  if (!error) return false;
  if (isQuotaError(error)) return false;

  const status = Number(error?.status ?? error?.code ?? error?.error?.code ?? 0);
  if (status >= 500 && status < 600) return true;

  const msg = String(error?.message || error?.error?.message || "").toUpperCase();
  return (
    msg.includes("UNAVAILABLE") ||
    msg.includes("INTERNAL") ||
    msg.includes("DEADLINE_EXCEEDED") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ENETUNREACH") ||
    msg.includes("EAI_AGAIN") ||
    msg.includes("FETCH FAILED")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractBillTypeFromText(text: string): BillType {
  const raw =
    extractRegexValue(
      text,
      /Peaje de (?:transporte y distribución|acceso a la red \(ATR\)):\s*(2(?:\.0)?TD|3(?:\.0)?TD)\b/i,
    ) ??
    extractRegexValue(text, /\bPVPC\s+(2(?:\.0)?TD|3(?:\.0)?TD)\b/i);

  return normalizeBillType(raw);
}

function extractInvoiceConsumption(text: string): number | null {
  return (
    parseSpanishNumber(
      extractRegexValue(
        text,
        /Su consumo en el periodo facturado ha sido\s*([\d.,]+)\s*kWh/i,
      ),
    ) ??
    parseSpanishNumber(
      extractRegexValue(
        text,
        /Consumo total de\s+esta factura\.?\s*([\d.,]+)\s*kWh/i,
      ),
    )
  );
}

function extractBilledDays(text: string): number | null {
  return (
    parseSpanishNumber(
      extractRegexValue(text, /(\d{1,3})\s*días\s*\*\s*[\d.,]+\s*€\/día/i),
    ) ??
    parseSpanishNumber(
      extractRegexValue(text, /D[ií]AS FACTURADOS:\s*(\d{1,3})\b/i),
    )
  );
}

function extractPostcodeAverageConsumption(text: string): number | null {
  return (
    parseSpanishNumber(
      extractRegexValue(
        text,
        /La media de los consumidores con el mismo código postal ha sido de\s*([\d.,]+)\s*kWh/i,
      ),
    ) ??
    parseSpanishNumber(
      extractRegexValue(
        text,
        /consumo medio de electricidad de los suministros en su mismo código postal ha sido de\s*([\d.,]+)\s*kWh/i,
      ),
    )
  );
}

function extractInvoiceVariableEnergyAmount(text: string): number | null {
  return (
    parseSpanishNumber(
      extractRegexValue(
        text,
        /Facturación por energía consumida\s*\("TÉRMINO VARIABLE"\)\s*([\d.,]+)\s*€/i,
      ),
    ) ??
    parseSpanishNumber(
      extractRegexValue(
        text,
        /Por energía consumida\s*([\d.,]+)\s*€/i,
      ),
    )
  );
}

function bufferToBase64(buffer: Buffer): string {
  return buffer.toString("base64");
}

function emptyPeriods(): PeriodValues {
  return { P1: null, P2: null, P3: null, P4: null, P5: null, P6: null };
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

  let value = raw.trim().replace(/[^\d,.-]/g, "");
  if (!value) return null;

  const hasComma = value.includes(",");
  const hasDot = value.includes(".");

  if (hasComma && hasDot) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    value = value.replace(",", ".");
  } else if (hasDot) {
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
  return str ? str.replace(/\s+/g, "").toUpperCase() : null;
}

function normalizeCups(value: unknown): string | null {
  const str = safeString(value);
  return str ? str.replace(/\s+/g, "").toUpperCase() : null;
}

function normalizeIbanPreservingMask(value: unknown): string | null {
  const str = safeString(value);
  return str ? str.toUpperCase().replace(/\s+/g, " ") : null;
}

function ibanNeedsCompletion(iban: string | null): boolean {
  return !!iban && iban.includes("*");
}

function normalizePhone(value: unknown): string | null {
  const str = safeString(value);
  return str ? str.replace(/\s+/g, "") : null;
}

function extractResponseText(response: any): string {
  if (!response?.text) return "";
  return typeof response.text === "function"
    ? response.text().trim()
    : String(response.text).trim();
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
    if (RELEVANT_INVOICE_REGEX.test(String(lines[i]))) {
      for (
        let j = Math.max(0, i - 2);
        j <= Math.min(lines.length - 1, i + 2);
        j++
      ) {
        selected.add(j);
      }
    }
  }

  return (
    selected.size > 0
      ? [...selected]
          .sort((a, b) => a - b)
          .map((i) => lines[i])
          .join("\n")
      : lines.join("\n")
  ).slice(0, MAX_TEXT_CHARS);
}

function buildPrompt(fileName: string, sourceMode: "text" | "pdf"): string {
  // Las reglas de extracción viven en SYSTEM_INSTRUCTION. Aquí solo
  // damos contexto puntual sobre el archivo que se va a analizar.
  const sourceHint =
    sourceMode === "text"
      ? "A continuación tienes el texto extraído del PDF (puede contener pequeños errores de OCR). Analízalo y devuelve el JSON conforme al schema."
      : "A continuación tienes el PDF original adjunto como fichero binario. Analízalo y devuelve el JSON conforme al schema.";

  return [
    `Archivo: ${fileName}`,
    sourceHint,
    "Si algún dato no aparece o tienes dudas razonables, devuelve null en ese campo. NO inventes valores.",
  ].join("\n");
}

function extractContractedPowerInfo(text: string): {
  contractedPowerText: string | null;
  contractedPowerKw: number | null;
  contractedPowerP1: number | null;
  contractedPowerP2: number | null;
} {
  const empty = {
    contractedPowerText: null,
    contractedPowerKw: null,
    contractedPowerP1: null,
    contractedPowerP2: null,
  };

  const directMatch = text.match(
    /Potencias contratadas:\s*punta-llano\s*([\d.,]+)\s*kW;\s*valle\s*([\d.,]+)\s*kW/i,
  );

  if (directMatch) {
    const p1 = parseSpanishNumber(directMatch[1]);
    const p2 = parseSpanishNumber(directMatch[2]);

    return {
      contractedPowerText: normalizeWhitespace(
        `punta-llano ${directMatch[1]} kW; valle ${directMatch[2]} kW`,
      ),
      contractedPowerKw:
        p1 != null && p2 != null && Math.abs(p1 - p2) < 0.0001 ? p1 : null,
      contractedPowerP1: p1,
      contractedPowerP2: p2,
    };
  }

  const p1 =
    parseSpanishNumber(
      extractRegexValue(text, /Pot\.\s*Punta-Llano\s*([\d.,]+)\s*kW/i),
    ) ??
    parseSpanishNumber(
      extractRegexValue(text, /punta-llano\s*([\d.,]+)\s*kW/i),
    );

  const p2 =
    parseSpanishNumber(
      extractRegexValue(text, /Pot\.\s*Valle\s*([\d.,]+)\s*kW/i),
    ) ??
    parseSpanishNumber(
      extractRegexValue(text, /valle\s*([\d.,]+)\s*kW/i),
    );

  if (p1 != null || p2 != null) {
    return {
      contractedPowerText:
        p1 != null && p2 != null
          ? `punta-llano ${formatSpanishPower(p1)} kW; valle ${formatSpanishPower(p2)} kW`
          : null,
      contractedPowerKw:
        p1 != null && p2 != null && Math.abs(p1 - p2) < 0.0001 ? p1 : null,
      contractedPowerP1: p1,
      contractedPowerP2: p2,
    };
  }

  return empty;
}

function formatSpanishPower(value: number): string {
  return value.toFixed(3).replace(".", ",");
}

function splitFullName(fullName: string | null): {
  fullName: string | null;
  name: string | null;
  lastname1: string | null;
  lastname2: string | null;
  surnames: string | null;
} {
  if (!fullName)
    return {
      fullName: null,
      name: null,
      lastname1: null,
      lastname2: null,
      surnames: null,
    };

  const clean = normalizeWhitespace(fullName);
  const parts = clean.split(" ").filter(Boolean);

  if (parts.length === 1)
    return {
      fullName: clean,
      name: parts[0],
      lastname1: null,
      lastname2: null,
      surnames: null,
    };

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
  return [
    "900225235",
    "960882467",
    "900171171",
    "900224522",
    "960882468",
    "963866000",
  ].includes(value.replace(/\s+/g, ""));
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
  if (!address)
    return {
      address: null,
      street: null,
      postalCode: null,
      city: null,
      province: null,
      country: "España",
    };

  const normalized = normalizeWhitespace(address);
  const postalCode = normalized.match(/\b(\d{5})\b/)?.[1] ?? null;
  const province = normalized.match(/\(([^)]+)\)\s*$/)?.[1]?.trim() ?? null;

  let city: string | null = null;
  if (postalCode) {
    const afterPostal = normalized.split(postalCode)[1] ?? "";
    const beforeProvince = province
      ? afterPostal.replace(new RegExp(`\\(${province}\\)\\s*$`), "")
      : afterPostal;
    city = safeString(beforeProvince.replace(/^[,\s-]+/, ""));
  }

  let street = normalized;
  if (postalCode)
    street = normalized.split(postalCode)[0]?.trim() ?? normalized;

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
  if (!data.customer.dni) missing.push("customer.dni");
  if (!data.customer.cups) missing.push("customer.cups");
  if (!data.customer.iban) missing.push("customer.iban");
  if (!data.location.address) missing.push("location.address");
  if (!data.invoice_data.type) missing.push("invoice_data.type");
  if (data.invoice_data.currentInvoiceConsumptionKwh == null)
    missing.push("invoice_data.currentInvoiceConsumptionKwh");

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
  return match?.[1] ? normalizeWhitespace(match[1]) : null;
}

function extractFullNameFromText(text: string): string | null {
  return extractRegexValue(
    text,
    /Titular(?:\s+Potencia)?:\s*([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s.'-]{3,}?)(?:\s+Potencia punta:|\n)/i,
  );
}

function extractSupplyAddress(text: string): string | null {
  const block = text.match(
    /Dirección de suministro:\s*([\s\S]{0,180}?)(?:Nº DE CONTRATO|RESUMEN DE FACTURA|NIF titular del contrato|Número de contrato de acceso|Forma de pago)/i,
  );
  return block?.[1] ? normalizeWhitespace(block[1]) : null;
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
    return periods;
  }

  const explicitPeriods = [
    ...text.matchAll(/\bP([1-6])\b[\s:=-]*([\d.,]+)\s*kWh/gi),
  ];
  for (const match of explicitPeriods) {
    periods[`P${match[1]}` as keyof PeriodValues] = parseSpanishNumber(
      match[2],
    );
  }
  return periods;
}

function extractPeriodPrices(text: string): PeriodValues {
  const prices = emptyPeriods();
  for (let i = 1; i <= 6; i++) {
    const match = text.match(
      new RegExp(`\\bP${i}\\b[\\s\\S]{0,40}?([\\d.,]+)\\s*€\\/kWh`, "i"),
    );
    if (match?.[1])
      prices[`P${i}` as keyof PeriodValues] = parseSpanishNumber(match[1]);
  }
  return prices;
}

function extractLocalDataFromText(text?: string): PartialExtraction {
  const source = text ? text.replace(/\r/g, "\n") : "";
  if (!source.trim()) return {};

  const fullName = extractFullNameFromText(source);
  const splitName = splitFullName(fullName);
  const addressParts = parseAddressParts(extractSupplyAddress(source));
    const contractedPowerInfo = extractContractedPowerInfo(source);

  const dni =
    extractRegexValue(source, /NIF:\s*([A-Z0-9]+)\b/i) ??
    extractRegexValue(source, /NIF titular del contrato:\s*([A-Z0-9]+)\b/i);

  const cups =
    extractRegexValue(
      source,
      /Código unificado de punto de suministro CUPS:\s*([A-Z0-9\s]+)\b/i,
    ) ??
    extractRegexValue(
      source,
      /Identificación punto de suministro \(CUPS\):\s*([A-Z0-9\s]+)\b/i,
    );

  const iban = extractRegexValue(
    source,
    /IBAN:\s*([A-Z]{2}\s*\d{2}(?:\s*[\d*]{4}){4,5})/i,
  );

  const normalizedType = extractBillTypeFromText(source);
  const billedDays = extractBilledDays(source);
  const totalConsumption = extractInvoiceConsumption(source);
  const postcodeAverage = extractPostcodeAverageConsumption(source);
  const invoiceVariableEnergyAmountEur =
    extractInvoiceVariableEnergyAmount(source);

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
    location: { ...addressParts },
    invoice_data: {
      type: normalizedType,
      billedDays,
      consumptionKwh: totalConsumption,
      currentInvoiceConsumptionKwh: totalConsumption,
      averageMonthlyConsumptionKwh: estimatedMonthly,
      postcodeAverageConsumptionKwh: postcodeAverage,
      invoiceVariableEnergyAmountEur,
      periods: extractPeriodConsumptions(source, normalizedType),
      periodPricesEurPerKwh: extractPeriodPrices(source),
            contractedPowerText: contractedPowerInfo.contractedPowerText,
      contractedPowerKw: contractedPowerInfo.contractedPowerKw,
      contractedPowerP1: contractedPowerInfo.contractedPowerP1,
      contractedPowerP2: contractedPowerInfo.contractedPowerP2,
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
        contractedPowerText: safeString(data?.invoice_data?.contractedPowerText),
      contractedPowerKw: safeNumber(data?.invoice_data?.contractedPowerKw),
      contractedPowerP1: safeNumber(data?.invoice_data?.contractedPowerP1),
      contractedPowerP2: safeNumber(data?.invoice_data?.contractedPowerP2),
  postcodeAverageConsumptionKwh: safeNumber(
    data?.invoice_data?.postcodeAverageConsumptionKwh,
  ),
  invoiceVariableEnergyAmountEur: safeNumber(
    data?.invoice_data?.invoiceVariableEnergyAmountEur,
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
            (item: any) => typeof item === "string",
          )
        : [],
      warnings: Array.isArray(data?.extraction?.warnings)
        ? data.extraction.warnings.filter(
            (item: any) => typeof item === "string",
          )
        : [],
      manualReviewFields: Array.isArray(data?.extraction?.manualReviewFields)
        ? data.extraction.manualReviewFields.filter(
            (item: any) => typeof item === "string",
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

  if (normalized.invoice_data.type === "2TD") {
    normalized.invoice_data.periods.P4 = null;
    normalized.invoice_data.periods.P5 = null;
    normalized.invoice_data.periods.P6 = null;
  }

  normalized.extraction.missingFields = listMissingFields(normalized);
    if (
    normalized.invoice_data.contractedPowerKw == null &&
    normalized.invoice_data.contractedPowerP1 != null &&
    normalized.invoice_data.contractedPowerP2 != null &&
    Math.abs(
      normalized.invoice_data.contractedPowerP1 -
        normalized.invoice_data.contractedPowerP2,
    ) < 0.0001
  ) {
    normalized.invoice_data.contractedPowerKw =
      normalized.invoice_data.contractedPowerP1;
  }

  if (
    !normalized.invoice_data.contractedPowerText &&
    normalized.invoice_data.contractedPowerP1 != null &&
    normalized.invoice_data.contractedPowerP2 != null
  ) {
    normalized.invoice_data.contractedPowerText =
      `punta-llano ${formatSpanishPower(normalized.invoice_data.contractedPowerP1)} kW; valle ${formatSpanishPower(normalized.invoice_data.contractedPowerP2)} kW`;
  }
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
        localData.invoice_data?.averageMonthlyConsumptionKwh ??
        aiData.invoice_data.averageMonthlyConsumptionKwh ??
        null,
              contractedPowerText:
        localData.invoice_data?.contractedPowerText ??
        aiData.invoice_data.contractedPowerText,
      contractedPowerKw:
        localData.invoice_data?.contractedPowerKw ??
        aiData.invoice_data.contractedPowerKw,
      contractedPowerP1:
        localData.invoice_data?.contractedPowerP1 ??
        aiData.invoice_data.contractedPowerP1,
      contractedPowerP2:
        localData.invoice_data?.contractedPowerP2 ??
        aiData.invoice_data.contractedPowerP2,
      postcodeAverageConsumptionKwh:
        localData.invoice_data?.postcodeAverageConsumptionKwh ??
        aiData.invoice_data.postcodeAverageConsumptionKwh,
      invoiceVariableEnergyAmountEur:
        localData.invoice_data?.invoiceVariableEnergyAmountEur ??
        aiData.invoice_data.invoiceVariableEnergyAmountEur ??
        null,
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

  const estimatedMonthlyFromPeriod = estimateMonthlyConsumption(
    merged.invoice_data.currentInvoiceConsumptionKwh,
    merged.invoice_data.billedDays,
  );

  if (estimatedMonthlyFromPeriod != null) {
    const extractedAverage = merged.invoice_data.averageMonthlyConsumptionKwh;

    if (extractedAverage == null) {
      merged.invoice_data.averageMonthlyConsumptionKwh =
        estimatedMonthlyFromPeriod;
    } else {
      const deviation =
        Math.abs(extractedAverage - estimatedMonthlyFromPeriod) /
        estimatedMonthlyFromPeriod;

      if (deviation > 0.2) {
        merged.invoice_data.averageMonthlyConsumptionKwh =
          estimatedMonthlyFromPeriod;

        merged.extraction.warnings.push(
          "El consumo medio mensual extraído por IA era inconsistente con el periodo facturado y se ha recalculado a partir del consumo real y los días facturados.",
        );

        if (
          !merged.extraction.manualReviewFields.includes(
            "invoice_data.averageMonthlyConsumptionKwh",
          )
        ) {
          merged.extraction.manualReviewFields.push(
            "invoice_data.averageMonthlyConsumptionKwh",
          );
        }
      }
    }
  }

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

  if (merged.invoice_data.averageMonthlyConsumptionKwh == null) {
    merged.invoice_data.averageMonthlyConsumptionKwh =
      estimateMonthlyConsumption(
        merged.invoice_data.currentInvoiceConsumptionKwh,
        merged.invoice_data.billedDays,
      );
  }

  if (merged.invoice_data.consumptionKwh == null) {
    merged.invoice_data.consumptionKwh =
      merged.invoice_data.currentInvoiceConsumptionKwh;
  }

  if (
    merged.customer.ibanNeedsCompletion &&
    !merged.extraction.manualReviewFields.includes("customer.iban")
  ) {
    merged.extraction.manualReviewFields.push("customer.iban");
  }

  const allPeriodPricesNull = Object.values(
    merged.invoice_data.periodPricesEurPerKwh,
  ).every((value) => value == null);

  if (allPeriodPricesNull) {
    merged.extraction.warnings.push(
      "La factura no muestra €/kWh explícitos por periodo tarifario.",
    );
  }

  merged.extraction.missingFields = listMissingFields(merged);
    if (
    merged.invoice_data.contractedPowerKw == null &&
    merged.invoice_data.contractedPowerP1 != null &&
    merged.invoice_data.contractedPowerP2 != null &&
    Math.abs(
      merged.invoice_data.contractedPowerP1 -
        merged.invoice_data.contractedPowerP2,
    ) < 0.0001
  ) {
    merged.invoice_data.contractedPowerKw =
      merged.invoice_data.contractedPowerP1;
  }

  if (
    !merged.invoice_data.contractedPowerText &&
    merged.invoice_data.contractedPowerP1 != null &&
    merged.invoice_data.contractedPowerP2 != null
  ) {
    merged.invoice_data.contractedPowerText =
      `punta-llano ${formatSpanishPower(merged.invoice_data.contractedPowerP1)} kW; valle ${formatSpanishPower(merged.invoice_data.contractedPowerP2)} kW`;
  }
  
  return merged;
}

/**
 * Función que tu orquestador importa
 * Se ha cambiado el nombre a 'extractDataFromBill' para evitar el SyntaxError
 */
export async function extractDataFromBill(
  input: InvoiceBinaryInput,
): Promise<ExtractedBillData> {
  const ai = getAiClient();
  const textToAnalyze = compactInvoiceText(input.extractedText);
  const useText = textToAnalyze.length > 50;

  const prompt = buildPrompt(input.fileName, useText ? "text" : "pdf");
  const contents: any[] = [prompt];

  if (useText) {
    contents.push(textToAnalyze);
  } else if (input.buffer) {
    contents.push({
      inlineData: {
        mimeType: input.mimeType || "application/pdf",
        data: bufferToBase64(input.buffer),
      },
    });
  } else {
    throw new Error("No hay texto ni buffer válido para procesar.");
  }

  const generationConfig = {
    systemInstruction: SYSTEM_INSTRUCTION,
    responseMimeType: "application/json",
    responseSchema: extractionResponseSchema,
    // 0 = determinismo máximo: lo que queremos para extracción estructurada.
    temperature: 0,
    topP: 0.95,
    maxOutputTokens: 4096,
    // Gemini 2.5 soporta "thinking". Con responseSchema no aporta nada
    // para este caso y penaliza latencia/coste: lo desactivamos.
    thinkingConfig: { thinkingBudget: 0 },
  };

  let response: any;
  let lastError: any;

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    try {
      response = await ai.models.generateContent({
        model: DEFAULT_MODEL,
        contents,
        config: generationConfig,
      });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;

      if (isQuotaError(error)) {
        console.error(
          `[gemini] Cuota agotada (intento ${attempt}/${GEMINI_MAX_ATTEMPTS}):`,
          describeGeminiError(error),
        );
        throw error;
      }

      const transient = isTransientError(error);
      const canRetry = transient && attempt < GEMINI_MAX_ATTEMPTS;

      console.error(
        `[gemini] Llamada generateContent falló (intento ${attempt}/${GEMINI_MAX_ATTEMPTS}, modelo=${DEFAULT_MODEL}, modo=${useText ? "text" : "pdf"}, archivo=${input.fileName}, transitorio=${transient}):`,
        describeGeminiError(error),
      );

      if (!canRetry) {
        throw error;
      }

      // Backoff exponencial con jitter: 600ms, 1200ms, 2400ms…
      const delay =
        GEMINI_RETRY_BASE_MS * 2 ** (attempt - 1) +
        Math.floor(Math.random() * GEMINI_RETRY_BASE_MS);
      await sleep(delay);
    }
  }

  if (!response) {
    throw lastError ?? new Error("Gemini no devolvió respuesta tras reintentos.");
  }

  const jsonText = extractResponseText(response);

  if (!jsonText) {
    console.error(
      `[gemini] Respuesta vacía de Gemini. modelo=${DEFAULT_MODEL}, archivo=${input.fileName}`,
    );
    throw new Error("Gemini devolvió una respuesta vacía.");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    console.error(
      `[gemini] No se pudo parsear el JSON devuelto por Gemini (archivo=${input.fileName}). Primeros 500 chars:`,
      jsonText.slice(0, 500),
    );
    throw new Error("Gemini devolvió JSON malformado.");
  }

  const aiData = normalizeExtraction(parsed);
  const localData = useText ? extractLocalDataFromText(textToAnalyze) : {};

  return mergeExtractions(aiData, localData);
}
