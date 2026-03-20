export interface ConfirmStudyPayload {
  invoiceFile: File;
  proposalFile: Blob | File;
  customer: Record<string, any>;
  location?: Record<string, any> | null;
  invoiceData?: Record<string, any> | null;
  calculation?: Record<string, any> | null;
  selectedInstallationId?: string | null;
  selectedInstallationSnapshot?: Record<string, any> | null;
  language?: string;
  consentAccepted?: boolean;
}

export async function confirmStudy(payload: ConfirmStudyPayload) {
  const formData = new FormData();

  formData.append("invoice", payload.invoiceFile);

  const proposalAsFile =
    payload.proposalFile instanceof File
      ? payload.proposalFile
      : new File([payload.proposalFile], "propuesta.pdf", {
          type: "application/pdf",
        });

  formData.append("proposal", proposalAsFile);

  formData.append("customer", JSON.stringify(payload.customer ?? {}));
  formData.append("location", JSON.stringify(payload.location ?? null));
  formData.append("invoice_data", JSON.stringify(payload.invoiceData ?? null));
  formData.append("calculation", JSON.stringify(payload.calculation ?? null));
  formData.append(
    "selected_installation_snapshot",
    JSON.stringify(payload.selectedInstallationSnapshot ?? null)
  );

  if (payload.selectedInstallationId) {
    formData.append("selected_installation_id", payload.selectedInstallationId);
  }

  formData.append("language", payload.language ?? "ES");
  formData.append(
    "consent_accepted",
    String(payload.consentAccepted ?? false)
  );

  const response = await fetch("/api/confirm-study", {
    method: "POST",
    body: formData,
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result?.details || result?.error || "Error confirmando estudio");
  }

  return result;
}