import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import axios from "axios";
import type { TFunction } from "i18next";
import { sileo } from "sileo";

import {
  INSTALLATION_SEARCH_RADIUS_METERS,
} from "../../constants/proposal.constants";
import type {
  ApiInstallation,
  ProposalMode,
  Step,
  ValidationBillData,
} from "../types/proposal.types";
import {
  getDefaultProposalMode,
  normalizeInstallationModalidad,
} from "../utils/proposalModes";
import { resolveEffectiveAssignedKwpForInstallation } from "../utils/proposalCalculation";
import type { ExtractedBillData } from "@/src/services/geminiService";

export type InstallationAvailabilityError =
  | "no_installations_in_radius"
  | "insufficient_capacity"
  | null;

interface UseInstallationFlowParams {
  clientCoordinates: { lat: number; lng: number } | null;
  extractedData: Partial<ValidationBillData> | null;
  rawExtraction: ExtractedBillData | null;
  setCurrentStep: Dispatch<SetStateAction<Step>>;
  setSelectedProposalView: Dispatch<SetStateAction<ProposalMode>>;
  t: TFunction;
}

export function useInstallationFlow({
  clientCoordinates,
  extractedData,
  rawExtraction,
  setCurrentStep,
  setSelectedProposalView,
  t,
}: UseInstallationFlowParams) {
  const [installations, setInstallations] = useState<ApiInstallation[]>([]);
  const [selectedInstallation, setSelectedInstallation] =
    useState<ApiInstallation | null>(null);
  const [isLoadingInstallations, setIsLoadingInstallations] = useState(false);
  const [installationAvailabilityError, setInstallationAvailabilityError] =
    useState<InstallationAvailabilityError>(null);

  const clearInstallations = useCallback(() => {
    setInstallations([]);
  }, []);

  const resetInstallationSelection = useCallback(() => {
    setSelectedInstallation(null);
    setInstallationAvailabilityError(null);
  }, []);

  const fetchInstallations = useCallback(
    async (
      coordsParam?: { lat: number; lng: number } | null,
      validatedDataParam?: ValidationBillData | null,
    ) => {
      const coords = coordsParam ?? clientCoordinates;
      const validatedData =
        validatedDataParam ?? (extractedData as ValidationBillData | null);

      if (!coords) {
        setInstallations([]);
        setInstallationAvailabilityError("no_installations_in_radius");
        sileo.error({
          title: t(
            "toasts.map.locationUnavailableTitle",
            "Ubicación no disponible",
          ),
          description: t(
            "toasts.map.locationUnavailableDescription",
            "No se ha podido obtener la latitud y longitud del cliente.",
          ),
        });
        return;
      }

      if (!validatedData) {
        setInstallations([]);
        sileo.error({
          title: t("toasts.map.insufficientDataTitle", "Datos insuficientes"),
          description: t(
            "toasts.map.insufficientDataDescription",
            "No se han encontrado los datos validados del cliente para calcular la potencia necesaria.",
          ),
        });
        return;
      }

      setIsLoadingInstallations(true);
      setInstallationAvailabilityError(null);

      try {
        const response = await axios.get<
          ApiInstallation[] | { data: ApiInstallation[] }
        >("/api/installations", {
          params: {
            lat: coords.lat,
            lng: coords.lng,
            radius: INSTALLATION_SEARCH_RADIUS_METERS,
          },
        });

        const responseData = response.data;
        const parsedInstallations = Array.isArray(responseData)
          ? responseData
          : Array.isArray(responseData?.data)
            ? responseData.data
            : [];

        const installationsInRadius = parsedInstallations
          .filter((item) => item.active !== false)
          .map((item) => ({
            ...item,
            modalidad: normalizeInstallationModalidad(item.modalidad),
          }));

        if (installationsInRadius.length === 0) {
          setInstallations([]);
          setInstallationAvailabilityError("no_installations_in_radius");
          return;
        }

        const eligibleInstallations = installationsInRadius
          .map((item) => {
            const requiredKwp = resolveEffectiveAssignedKwpForInstallation(
              validatedData,
              item,
              rawExtraction,
            );

            return {
              ...item,
              required_kwp: requiredKwp,
            };
          })
          .filter((item) => {
            const availableKwp = Number(item.available_kwp ?? 0);
            const requiredKwp = Number(item.required_kwp ?? 0);

            return (
              Number.isFinite(requiredKwp) &&
              requiredKwp > 0 &&
              availableKwp >= requiredKwp
            );
          });

        if (eligibleInstallations.length === 0) {
          setInstallations([]);
          setInstallationAvailabilityError("insufficient_capacity");
          return;
        }

        setInstallations(eligibleInstallations);
      } catch (error) {
        console.error("Error fetching installations:", error);
        sileo.error({
          title: t(
            "toasts.map.loadInstallationsErrorTitle",
            "Error al cargar instalaciones",
          ),
          description: t(
            "toasts.map.loadInstallationsErrorDescription",
            "Inténtalo de nuevo más tarde",
          ),
        });
        setInstallations([]);
        setInstallationAvailabilityError(null);
      } finally {
        setIsLoadingInstallations(false);
      }
    },
    [clientCoordinates, extractedData, rawExtraction, t],
  );

  const handleInstallationSelect = useCallback(
    (inst: ApiInstallation) => {
      const normalizedInst: ApiInstallation = {
        ...inst,
        modalidad: normalizeInstallationModalidad(inst.modalidad),
      };

      const availableKwp = Number(normalizedInst.available_kwp ?? 0);
      const requiredKwp = Number(normalizedInst.required_kwp ?? 0);

      if (requiredKwp > 0 && availableKwp < requiredKwp) {
        sileo.error({
          title: t(
            "toasts.map.insufficientCapacityTitle",
            "Capacidad insuficiente",
          ),
          description: t(
            "toasts.map.insufficientCapacityDescription",
            "Esta instalación no dispone de potencia suficiente para cubrir la recomendación del estudio.",
          ),
        });
        return;
      }

      setSelectedInstallation(normalizedInst);
      setSelectedProposalView(getDefaultProposalMode(normalizedInst.modalidad));
      setCurrentStep("calculation");
    },
    [setCurrentStep, setSelectedProposalView, t],
  );

  return {
    installations,
    selectedInstallation,
    isLoadingInstallations,
    installationAvailabilityError,
    clearInstallations,
    resetInstallationSelection,
    fetchInstallations,
    handleInstallationSelect,
  };
}
