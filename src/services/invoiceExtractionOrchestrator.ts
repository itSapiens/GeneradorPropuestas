import { extractDataFromBill, type ExtractedBillData } from "./geminiService";

export interface ExtractionOrchestratorInput {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

export async function extractInvoiceWithFallback(
  input: ExtractionOrchestratorInput
): Promise<ExtractedBillData> {
  const { buffer, mimeType, fileName } = input;

  try {
    const aiResult = await extractDataFromBill({
      buffer,
      mimeType,
      fileName,
    });

    aiResult.extraction.extractionMethod = "ai";
    aiResult.extraction.fallbackUsed = false;

    return aiResult;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Error desconocido en extracción IA";

    console.error("Error en extracción de factura con IA:", message);

    throw new Error(
      "No se pudo completar la extracción automática de la factura. Inténtalo de nuevo en unos minutos."
    );
  }
}