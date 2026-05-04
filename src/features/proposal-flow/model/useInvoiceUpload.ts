import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { TFunction } from "i18next";
import type { UseFormSetValue } from "react-hook-form";
import { sileo } from "sileo";

import { extractBillFromApi } from "@/src/entities/proposal/infrastructure/proposalApi.adapter";
import type { ExtractedBillData } from "@/src/entities/proposal/domain/proposal.types";
import type {
  Step,
  ValidationBillData,
  ValidationBillDataFormInput,
} from "@/src/entities/proposal/domain/proposal.types";
import {
  mapExtractedToBillData,
  showExtractionToasts,
} from "@/src/features/proposal-flow/lib/extractionMappers";
import { applyExtractedBillToValidationForm } from "@/src/features/proposal-flow/lib/validationFormValues";

interface UseInvoiceUploadParams {
  privacyAccepted: boolean;
  setUploadedInvoiceFile: Dispatch<SetStateAction<File | null>>;
  setRawExtraction: Dispatch<SetStateAction<ExtractedBillData | null>>;
  setExtractedData: Dispatch<
    SetStateAction<Partial<ValidationBillData> | null>
  >;
  setCurrentStep: Dispatch<SetStateAction<Step>>;
  setValue: UseFormSetValue<ValidationBillDataFormInput>;
  t: TFunction;
}

export function useInvoiceUpload({
  privacyAccepted,
  setUploadedInvoiceFile,
  setRawExtraction,
  setExtractedData,
  setCurrentStep,
  setValue,
  t,
}: UseInvoiceUploadParams) {
  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!privacyAccepted) {
        sileo.warning({
          title: t(
            "toasts.upload.privacyRequiredTitle",
            "Debes aceptar la política de privacidad",
          ),
          description: t(
            "toasts.upload.privacyRequiredDescription",
            "Para subir la factura y continuar, debes aceptar el tratamiento de datos.",
          ),
        });
        return;
      }

      setUploadedInvoiceFile(file);

      sileo.promise(
        (async () => {
          const extraction = await extractBillFromApi(file);

          if (import.meta.env.DEV) {
            console.debug("[extraction] contracted power:", {
              text: extraction.invoice_data?.contractedPowerText,
              kw: extraction.invoice_data?.contractedPowerKw,
              p1: extraction.invoice_data?.contractedPowerP1,
              p2: extraction.invoice_data?.contractedPowerP2,
            });
          }

          const mappedData = mapExtractedToBillData(extraction);

          setRawExtraction(extraction);
          setExtractedData(mappedData);
          applyExtractedBillToValidationForm(mappedData, setValue);

          setCurrentStep("validation");
          showExtractionToasts(extraction, t);

          if (import.meta.env.DEV) {
            console.debug("[extraction] invoice_data:", extraction.invoice_data);
            console.debug("[extraction] customer:", extraction.customer);
            console.debug("[extraction] potencia mapeada:", {
              contractedPowerText: mappedData.contractedPowerText,
              contractedPowerKw: mappedData.contractedPowerKw,
              contractedPowerP1: mappedData.contractedPowerP1,
              contractedPowerP2: mappedData.contractedPowerP2,
            });
          }

          return extraction;
        })(),
        {
          loading: {
            title: t("toasts.upload.processingInvoice", "Procesando factura..."),
          },
          success: {
            title: t(
              "toasts.upload.invoiceProcessedSuccess",
              "Factura procesada con éxito",
            ),
          },
          error: {
            title: t(
              "toasts.upload.invoiceProcessedError",
              "No se pudo extraer la información de la factura",
            ),
          },
        },
      );
    },
    [
      privacyAccepted,
      setCurrentStep,
      setExtractedData,
      setRawExtraction,
      setUploadedInvoiceFile,
      setValue,
      t,
    ],
  );

  return { handleFileSelect };
}
