import axios from "axios";

type ConfirmStudyParams = {
  invoiceFile?: File | null;
  proposalFile: File;
  customer: Record<string, unknown>;
  location?: Record<string, unknown> | null;
  invoiceData?: Record<string, unknown> | null;
  calculation?: unknown;
  selectedInstallationId?: string | null;
  selectedInstallationSnapshot?: unknown;
  language?: string;
  consentAccepted?: boolean;
  status?: string;
  assignedKwp?: number;
};

export async function confirmStudy({
  invoiceFile,
  proposalFile,
  customer,
  location,
  invoiceData,
  calculation,
  selectedInstallationId,
  selectedInstallationSnapshot,
  assignedKwp,
  language = "ES",
  consentAccepted = true,
}: ConfirmStudyParams) {
  const resolvedSelectedInstallationId =
    selectedInstallationId ??
    (typeof selectedInstallationSnapshot === "object" &&
    selectedInstallationSnapshot !== null
      ? ((selectedInstallationSnapshot as Record<string, unknown>).id ??
          (selectedInstallationSnapshot as Record<string, unknown>)
            .installationId ??
          ((selectedInstallationSnapshot as Record<string, unknown>)
            .installationData as Record<string, unknown> | undefined)?.id ??
          null)
      : null);

  const formData = new FormData();
  if (invoiceFile) {
    formData.append("invoice", invoiceFile);
  }
  formData.append("proposal", proposalFile);
  formData.append("customer", JSON.stringify(customer ?? {}));
  formData.append("location", JSON.stringify(location ?? {}));
  formData.append("invoice_data", JSON.stringify(invoiceData ?? {}));
  formData.append("calculation", JSON.stringify(calculation ?? {}));
  formData.append(
    "selected_installation_snapshot",
    JSON.stringify(selectedInstallationSnapshot ?? {}),
  );

  if (resolvedSelectedInstallationId) {
    formData.append(
      "selected_installation_id",
      String(resolvedSelectedInstallationId),
    );
  }

  if (typeof assignedKwp === "number" && assignedKwp > 0) {
    formData.append("assignedKwp", String(assignedKwp));
  }

  formData.append("language", language);
  formData.append("consent_accepted", String(consentAccepted));

  if (import.meta.env.DEV) {
    console.debug("[front] confirmStudy selected installation:", {
      originalSelectedInstallationId: selectedInstallationId ?? null,
      resolvedSelectedInstallationId,
      selectedInstallationSnapshot,
    });
  }

  const { data } = await axios.post("/api/confirm-study", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return data;
}
