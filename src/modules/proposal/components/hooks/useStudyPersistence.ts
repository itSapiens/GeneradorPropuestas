import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { TFunction } from "i18next";
import { sileo } from "sileo";

import {
  EMPTY_EXTRA_CONSUMPTION,
  type ExtraConsumptionSelections,
} from "@/src/components/shared/ExtraConsumptionModal";
import { confirmStudy } from "@/src/services/confirmStudyService";
import type { ExtractedBillData } from "@/src/services/geminiService";
import type { CalculationResult } from "@/src/modules/calculation/energyService";
import type {
  ApiInstallation,
  AppLanguage,
  ValidationBillData,
} from "../types/proposal.types";
import {
  buildPdfArtifact,
  buildProposalPdfSummariesForInstallation,
  pdfArtifactToBlob,
  savePdfArtifactLocally,
} from "../utils/proposalPdf";
import { toBaseBillData } from "../utils/extractionMappers";
import { resolveEffectiveAssignedKwpForInstallation } from "../utils/proposalCalculation";
import { buildStudyPersistencePayloads } from "../utils/studyPersistencePayloads";

interface UseStudyPersistenceParams {
  activeCalculationResult: CalculationResult | null;
  extractedData: Partial<ValidationBillData> | null;
  selectedInstallation: ApiInstallation | null;
  uploadedInvoiceFile: File | null;
  extraConsumption: ExtraConsumptionSelections;
  rawExtraction: ExtractedBillData | null;
  clientCoordinates: { lat: number; lng: number } | null;
  privacyAccepted: boolean;
  currentAppLanguage: AppLanguage;
  setSavedStudy: Dispatch<SetStateAction<any | null>>;
  t: TFunction;
}

export function useStudyPersistence({
  activeCalculationResult,
  extractedData,
  selectedInstallation,
  uploadedInvoiceFile,
  extraConsumption,
  rawExtraction,
  clientCoordinates,
  privacyAccepted,
  currentAppLanguage,
  setSavedStudy,
  t,
}: UseStudyPersistenceParams) {
  const handleDownloadPDF = useCallback(async () => {
    if (!activeCalculationResult || !extractedData || !selectedInstallation) {
      return;
    }

    sileo.promise(
      (async () => {
        const billData = toBaseBillData(extractedData, extraConsumption);

        const pdfSummaries = buildProposalPdfSummariesForInstallation(
          activeCalculationResult,
          selectedInstallation,
          t,
        );

        const pdfArtifact = await buildPdfArtifact(
          billData,
          activeCalculationResult,
          pdfSummaries,
          currentAppLanguage,
        );

        savePdfArtifactLocally(
          pdfArtifact,
          `Estudio_Solar_${billData.name || "cliente"}.pdf`,
        );
      })(),
      {
        loading: {
          title: t(
            "toasts.pdf.generatingTitle",
            "Generando tu estudio en PDF...",
          ),
        },
        success: {
          title: t(
            "toasts.pdf.generatedTitle",
            "PDF generado y descargado con éxito",
          ),
        },
        error: {
          title: t(
            "toasts.pdf.generateErrorTitle",
            "No se pudo generar el PDF",
          ),
        },
      },
    );
  }, [
    activeCalculationResult,
    currentAppLanguage,
    extraConsumption,
    extractedData,
    selectedInstallation,
    t,
  ]);

  const persistStudyAutomatically = useCallback(
    async (
      validatedData: ValidationBillData,
      result: CalculationResult,
      installation: ApiInstallation,
    ) => {
      if (!uploadedInvoiceFile) {
        throw new Error(
          "No se encuentra la factura original subida por el cliente",
        );
      }

      const billData = toBaseBillData(
        validatedData,
        extraConsumption ?? EMPTY_EXTRA_CONSUMPTION,
      );

      const proposalSummariesForPdf =
        buildProposalPdfSummariesForInstallation(result, installation, t);

      const pdfArtifact = await buildPdfArtifact(
        billData,
        result,
        proposalSummariesForPdf,
        currentAppLanguage,
      );

      const proposalBlob = pdfArtifactToBlob(pdfArtifact);
      const proposalFile = new File(
        [proposalBlob],
        `Estudio_Solar_${validatedData.name || "cliente"}.pdf`,
        { type: "application/pdf" },
      );

      const {
        customerPayload,
        invoiceDataPayload,
        locationPayload,
      } = buildStudyPersistencePayloads({
        validatedData,
        rawExtraction,
        extraConsumption: extraConsumption ?? EMPTY_EXTRA_CONSUMPTION,
        clientCoordinates,
      });

      if (import.meta.env.DEV) {
        console.debug("[front] confirmStudy payloads:", {
          customer: customerPayload,
          location: locationPayload,
          invoice: invoiceDataPayload,
        });
      }

      const assignedKwpForStudy = resolveEffectiveAssignedKwpForInstallation(
        validatedData,
        installation,
        rawExtraction,
      );

      const response = await confirmStudy({
        invoiceFile: uploadedInvoiceFile,
        proposalFile,
        customer: customerPayload,
        location: locationPayload,
        invoiceData: invoiceDataPayload,
        calculation: result,
        selectedInstallationId: installation.id,
        selectedInstallationSnapshot: installation,
        assignedKwp: assignedKwpForStudy,
        language: currentAppLanguage,
        consentAccepted: privacyAccepted,
      });

      if (import.meta.env.DEV) {
        console.debug("[front] confirmStudy response:", response);
      }

      setSavedStudy(response);

      if (response?.email?.status === "sent") {
        sileo.success({
          title: "Propuesta enviada por email",
          description: `Se ha enviado correctamente a ${
            response.email.to ?? "el cliente"
          }.`,
        });
      } else if (response?.email?.status === "failed") {
        sileo.error({
          title: "La propuesta se guardó, pero el email falló",
          description:
            response?.email?.error ??
            "No se pudo enviar el correo al cliente.",
        });
      }

      return response;
    },
    [
      clientCoordinates,
      currentAppLanguage,
      extraConsumption,
      privacyAccepted,
      rawExtraction,
      setSavedStudy,
      t,
      uploadedInvoiceFile,
    ],
  );

  return {
    handleDownloadPDF,
    persistStudyAutomatically,
  };
}
