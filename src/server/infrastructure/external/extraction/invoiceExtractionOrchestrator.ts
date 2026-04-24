import { extractDataFromBill, type ExtractedBillData } from "../../../../services/geminiService";
import { extractTextFromDocument } from "./documentTextExtractionService";

export interface ExtractionOrchestratorInput {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

export async function extractInvoiceWithFallback(
  input: ExtractionOrchestratorInput,
): Promise<ExtractedBillData> {
  const { buffer, mimeType, fileName } = input;

  let extractedText = "";
  try {
    const textResult = await extractTextFromDocument({
      buffer,
      mimeType,
      fileName,
    });
    extractedText = textResult.text || "";

    if (textResult.warnings?.length) {
      console.warn(
        `[orquestador] Avisos de extracción de texto (${fileName}):`,
        textResult.warnings.join(" | "),
      );
    }
  } catch (error) {
    console.warn(
      `[orquestador] Pre-extracción de texto falló para ${fileName}, se usará el buffer binario.`,
      error instanceof Error ? error.message : error,
    );
  }

  try {
    const aiResult = await extractDataFromBill({
      buffer,
      mimeType,
      fileName,
      extractedText,
    });

    aiResult.extraction.extractionMethod = "ai";
    aiResult.extraction.fallbackUsed = false;

    return aiResult;
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Error desconocido en extracción IA";

    console.error("[orquestador] Extracción IA fallida:", error);

    const wrapped = new Error(detail);
    (wrapped as any).cause = error;
    throw wrapped;
  }
}
