import { extractText as extractPdfText } from "unpdf";
import Tesseract from "tesseract.js";

export interface DocumentTextExtractionInput {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
}

export interface DocumentTextExtractionResult {
  text: string;
  method: "pdf-text" | "ocr-image" | "none";
  warnings: string[];
}

function normalizeText(text: string): string {
  return text.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").trim();
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const uint8Array = new Uint8Array(buffer);
  const result = await extractPdfText(uint8Array);

  const text = Array.isArray(result.text)
    ? result.text.join("\n")
    : typeof result.text === "string"
      ? result.text
      : "";

  return normalizeText(text);
}

async function extractTextFromImage(buffer: Buffer): Promise<string> {
  const {
    data: { text },
  } = await Tesseract.recognize(buffer, "spa");

  return normalizeText(text || "");
}

export async function extractTextFromDocument(
  input: DocumentTextExtractionInput
): Promise<DocumentTextExtractionResult> {
  const { buffer, mimeType } = input;
  const normalizedMime = (mimeType || "").toLowerCase();
  const warnings: string[] = [];

  if (!buffer?.length) {
    return {
      text: "",
      method: "none",
      warnings: ["No se recibió contenido binario para extraer texto."],
    };
  }

  if (normalizedMime === "application/pdf") {
    try {
      const pdfText = await extractTextFromPdf(buffer);

      if (pdfText) {
        return {
          text: pdfText,
          method: "pdf-text",
          warnings,
        };
      }

      warnings.push("El PDF no contenía texto nativo legible.");
      return {
        text: "",
        method: "none",
        warnings,
      };
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Error extrayendo texto del PDF: ${error.message}`
          : "Error desconocido extrayendo texto del PDF."
      );

      return {
        text: "",
        method: "none",
        warnings,
      };
    }
  }

  if (
    normalizedMime === "image/png" ||
    normalizedMime === "image/jpeg" ||
    normalizedMime === "image/jpg" ||
    normalizedMime === "image/webp"
  ) {
    try {
      const imageText = await extractTextFromImage(buffer);

      if (imageText) {
        return {
          text: imageText,
          method: "ocr-image",
          warnings,
        };
      }

      warnings.push("No se pudo reconocer texto suficiente en la imagen.");
      return {
        text: "",
        method: "none",
        warnings,
      };
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `Error aplicando OCR a la imagen: ${error.message}`
          : "Error desconocido aplicando OCR a la imagen."
      );

      return {
        text: "",
        method: "none",
        warnings,
      };
    }
  }

  return {
    text: "",
    method: "none",
    warnings: [`Tipo de archivo no soportado para extracción de texto: ${mimeType}`],
  };
}