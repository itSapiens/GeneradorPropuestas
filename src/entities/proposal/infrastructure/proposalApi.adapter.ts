import type { ExtractedBillData } from "@/src/entities/proposal/domain/proposal.types";

export async function extractBillFromApi(
  file: File,
): Promise<ExtractedBillData> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/extract-bill", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let message = "No se pudo extraer la información de la factura";

    try {
      const errorData = await response.json();
      message = errorData?.error || errorData?.details || message;
    } catch {
      // ignorar si no hay JSON válido
    }

    throw new Error(message);
  }

  return response.json();
}
