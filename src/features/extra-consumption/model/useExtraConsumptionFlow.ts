import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { TFunction } from "i18next";
import { sileo } from "sileo";

import {
  EMPTY_EXTRA_CONSUMPTION,
  type ExtraConsumptionSelections,
  calculateExtraMonthlyConsumption,
} from "@/src/features/extra-consumption/ui/ExtraConsumptionModal";
import type {
  ProposalMode,
  Step,
  StudyComparisonResult,
  ValidationBillData,
} from "@/src/entities/proposal/domain/proposal.types";
import { geocodeAddress } from "@/src/features/proposal-flow/lib/geocoding";

interface UseExtraConsumptionFlowParams {
  extractedData: Partial<ValidationBillData> | null;
  setExtractedData: Dispatch<
    SetStateAction<Partial<ValidationBillData> | null>
  >;
  setProposalResults: Dispatch<SetStateAction<StudyComparisonResult | null>>;
  setSelectedProposalView: Dispatch<SetStateAction<ProposalMode>>;
  resetInstallationSelection: () => void;
  clientCoordinates: { lat: number; lng: number } | null;
  setClientCoordinates: Dispatch<
    SetStateAction<{ lat: number; lng: number } | null>
  >;
  clearInstallations: () => void;
  fetchInstallations: (
    coordsParam?: { lat: number; lng: number } | null,
    validatedDataParam?: ValidationBillData | null,
  ) => Promise<void>;
  setCurrentStep: Dispatch<SetStateAction<Step>>;
  t: TFunction;
}

export function useExtraConsumptionFlow({
  extractedData,
  setExtractedData,
  setProposalResults,
  setSelectedProposalView,
  resetInstallationSelection,
  clientCoordinates,
  setClientCoordinates,
  clearInstallations,
  fetchInstallations,
  setCurrentStep,
  t,
}: UseExtraConsumptionFlowParams) {
  const [showExtraConsumptionModal, setShowExtraConsumptionModal] =
    useState(false);
  const [extraConsumption, setExtraConsumption] =
    useState<ExtraConsumptionSelections>(EMPTY_EXTRA_CONSUMPTION);
  const pendingValidationData = useRef<ValidationBillData | null>(null);

  const onValidationSubmit = useCallback(
    (data: ValidationBillData) => {
      const hiddenExtractionFields: Array<keyof ValidationBillData> = [
        "billType",
        "currentInvoiceConsumptionKwh",
        "averageMonthlyConsumptionKwh",
        "billedDays",
        "invoiceTotalAmountEur",
        "periodConsumptionP1",
        "periodConsumptionP2",
        "periodConsumptionP3",
        "periodConsumptionP4",
        "periodConsumptionP5",
        "periodConsumptionP6",
        "periodPriceP1",
        "periodPriceP2",
        "periodPriceP3",
        "periodPriceP4",
        "periodPriceP5",
        "periodPriceP6",
        "contractedPowerText",
        "contractedPowerKw",
        "contractedPowerP1",
        "contractedPowerP2",
      ];

      const normalizedData: ValidationBillData = {
        ...(extractedData ?? {}),
        ...data,
      };

      for (const field of hiddenExtractionFields) {
        if (extractedData?.[field] !== undefined) {
          (normalizedData as any)[field] = extractedData[field];
        }
      }

      normalizedData.monthlyConsumption =
        normalizedData.averageMonthlyConsumptionKwh ??
        data.monthlyConsumption ??
        extractedData?.monthlyConsumption ??
        0;

      setExtractedData(normalizedData);
      setProposalResults(null);
      setSelectedProposalView("investment");
      resetInstallationSelection();
      setExtraConsumption(EMPTY_EXTRA_CONSUMPTION);

      pendingValidationData.current = normalizedData;
      setShowExtraConsumptionModal(true);
    },
    [
      extractedData,
      resetInstallationSelection,
      setExtractedData,
      setProposalResults,
      setSelectedProposalView,
    ],
  );

  const proceedAfterExtraConsumption = useCallback(
    (selections: ExtraConsumptionSelections) => {
      setExtraConsumption(selections);
      setShowExtraConsumptionModal(false);

      const normalizedData = pendingValidationData.current;
      if (!normalizedData) return;

      const extraMonthly = calculateExtraMonthlyConsumption(selections);
      if (extraMonthly > 0) {
        const currentMonthly =
          normalizedData.averageMonthlyConsumptionKwh ??
          normalizedData.monthlyConsumption ??
          0;
        const augmented =
          Math.round((currentMonthly + extraMonthly) * 100) / 100;
        normalizedData.monthlyConsumption = augmented;
        normalizedData.averageMonthlyConsumptionKwh = augmented;
        setExtractedData({ ...normalizedData });
      }

      sileo.promise(
        (async () => {
          const preResolved =
            clientCoordinates &&
            Number.isFinite(clientCoordinates.lat) &&
            Number.isFinite(clientCoordinates.lng)
              ? clientCoordinates
              : null;

          const coords =
            preResolved ?? (await geocodeAddress(normalizedData.address));

          if (!coords) {
            setClientCoordinates(null);
            clearInstallations();
            setCurrentStep("map");

            sileo.error({
              title: t(
                "toasts.map.geocodeErrorTitle",
                "No se pudo localizar la dirección",
              ),
              description: t(
                "toasts.map.geocodeErrorDescription",
                "No hemos podido obtener las coordenadas de la dirección indicada. Prueba a seleccionar una sugerencia del autocompletado.",
              ),
            });

            return;
          }

          setClientCoordinates(coords);
          setCurrentStep("map");
          await fetchInstallations(coords, normalizedData);

          sileo.success({
            title: t(
              "toasts.validation.validatedSuccess",
              "Datos validados correctamente",
            ),
          });
        })(),
        {
          loading: {
            title: t(
              "toasts.validation.validatingLocationLoading",
              "Validando dirección y buscando instalaciones...",
            ),
          },
          success: {
            title: t(
              "toasts.validation.validatedSuccess",
              "Datos validados correctamente",
            ),
          },
          error: {
            title: t(
              "toasts.validation.validationError",
              "No se pudo validar la ubicación del cliente",
            ),
          },
        },
      );
    },
    [
      clearInstallations,
      clientCoordinates,
      fetchInstallations,
      setClientCoordinates,
      setCurrentStep,
      setExtractedData,
      t,
    ],
  );

  return {
    extraConsumption,
    showExtraConsumptionModal,
    onValidationSubmit,
    proceedAfterExtraConsumption,
  };
}
