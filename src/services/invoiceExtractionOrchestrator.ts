import { extractDataFromBill, type ExtractedBillData } from "./geminiService";
import { extractTextFromDocument } from "./documentTextExtractionService";

export interface ExtractionOrchestratorInput {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

/**
 * Wrapper alrededor de la extracción IA con Gemini.
 *
 * Flujo:
 *  1. Intentamos extraer texto nativo del documento (unpdf para PDFs,
 *     Tesseract para imágenes). Esto es rápido, determinista y barato.
 *  2. Si obtenemos texto utilizable (>50 chars), lo pasamos a Gemini como
 *     contexto textual en lugar de mandar el PDF entero en base64: muchos
 *     menos tokens y además habilita la pasada local de regex en
 *     `geminiService.extractLocalDataFromText`, que reconcilia datos.
 *  3. Si el PDF es escaneado puro o la extracción falla, caemos al envío
 *     del buffer binario a Gemini como antes.
 *
 * Mantiene el nombre histórico ("WithFallback") por compatibilidad con los
 * importadores existentes. Si Gemini falla, propaga el error con detalle.
 */
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
    // No es fatal: Gemini puede trabajar directamente sobre el buffer.
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

    // Volcamos el error completo para diagnóstico (no solo el message).
    console.error("[orquestador] Extracción IA fallida:", error);

    // Re-lanzamos un Error con el detalle para que el endpoint Express
    // pueda decidir qué exponer al frontend. NO lo enmascaramos.
    const wrapped = new Error(detail);
    (wrapped as any).cause = error;
    throw wrapped;
  }
}
