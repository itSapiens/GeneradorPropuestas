import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { TFunction } from "i18next";
import { sileo } from "sileo";

import { BillData } from "@/src/lib/validators";
import {
  CalculationResult,
  calculateEnergyStudy,
} from "@/src/modules/calculation/energyService";
import type { ExtractedBillData } from "@/src/services/geminiService";
import {
  INVESTMENT_MAINTENANCE_EUR_PER_KWP_YEAR,
} from "../../constants/proposal.constants";
import type {
  ApiInstallation,
  ProposalMode,
  Step,
  StudyComparisonResult,
  ValidationBillData,
} from "../types/proposal.types";
import { normalizeInstallationModalidad } from "../utils/proposalModes";
import {
  getInvoiceVariableEnergyAmountFromExtraction,
} from "../utils/extractionMappers";
import {
  getFixedInstallationPower,
  normalizeSelfConsumption,
} from "../utils/proposalCalculation";
import { getDefaultProposalMode } from "../utils/proposalModes";

interface UseProposalCalculationEffectParams {
  currentStep: Step;
  extractedData: Partial<ValidationBillData> | null;
  selectedInstallation: ApiInstallation | null;
  rawExtraction: ExtractedBillData | null;
  setProposalResults: Dispatch<SetStateAction<StudyComparisonResult | null>>;
  setSelectedProposalView: Dispatch<SetStateAction<ProposalMode>>;
  setCurrentStep: Dispatch<SetStateAction<Step>>;
  persistStudyAutomatically: (
    validatedData: ValidationBillData,
    result: CalculationResult,
    installation: ApiInstallation,
  ) => Promise<unknown>;
  t: TFunction;
}

export function useProposalCalculationEffect({
  currentStep,
  extractedData,
  selectedInstallation,
  rawExtraction,
  setProposalResults,
  setSelectedProposalView,
  setCurrentStep,
  persistStudyAutomatically,
  t,
}: UseProposalCalculationEffectParams) {
  const studyPersistLock = useRef(false);

  useEffect(() => {
    if (currentStep !== "calculation") return;
    if (!extractedData || !selectedInstallation) return;

    const timer = window.setTimeout(() => {
      const validatedData = extractedData as ValidationBillData;

      const periodConsumptions = {
        P1: validatedData.periodConsumptionP1,
        P2: validatedData.periodConsumptionP2,
        P3: validatedData.periodConsumptionP3,
        P4: validatedData.periodConsumptionP4,
        P5: validatedData.periodConsumptionP5,
        P6: validatedData.periodConsumptionP6,
      };

      const periodPrices = {
        P1: validatedData.periodPriceP1,
        P2: validatedData.periodPriceP2,
        P3: validatedData.periodPriceP3,
        P4: validatedData.periodPriceP4,
        P5: validatedData.periodPriceP5,
        P6: validatedData.periodPriceP6,
      };

      const invoiceVariableEnergyAmountEur =
        getInvoiceVariableEnergyAmountFromExtraction(rawExtraction);

      const fixedPower = getFixedInstallationPower(selectedInstallation);

      console.log("[calc] ── INPUTS ──────────────────────────────────────────");
      console.log(`  monthlyConsumptionKwh:         ${validatedData.averageMonthlyConsumptionKwh ?? validatedData.monthlyConsumption ?? 0}`);
      console.log(`  invoiceConsumptionKwh:          ${validatedData.currentInvoiceConsumptionKwh ?? validatedData.averageMonthlyConsumptionKwh ?? 0}`);
      console.log(`  invoiceVariableEnergyAmountEur: ${invoiceVariableEnergyAmountEur ?? "(no extraído)"}`);
      console.log(`  selfConsumptionRatio:           ${normalizeSelfConsumption(selectedInstallation.porcentaje_autoconsumo)}`);
      console.log(`  effectiveHours:                 ${selectedInstallation.horas_efectivas}`);
      console.log(`  maintenancePerKwp:              ${selectedInstallation.coste_anual_mantenimiento_por_kwp ?? INVESTMENT_MAINTENANCE_EUR_PER_KWP_YEAR}`);
      console.log(`  periodPrices:                   P1=${validatedData.periodPriceP1 ?? "-"} P2=${validatedData.periodPriceP2 ?? "-"} P3=${validatedData.periodPriceP3 ?? "-"}`);
      console.log(`  periodConsumptions:             P1=${validatedData.periodConsumptionP1 ?? "-"} P2=${validatedData.periodConsumptionP2 ?? "-"} P3=${validatedData.periodConsumptionP3 ?? "-"}`);
      console.log("[calc] ────────────────────────────────────────────────────");

      const result = calculateEnergyStudy({
        monthlyConsumptionKwh:
          validatedData.averageMonthlyConsumptionKwh ??
          validatedData.monthlyConsumption ??
          0,
        invoiceConsumptionKwh:
          validatedData.currentInvoiceConsumptionKwh ??
          validatedData.averageMonthlyConsumptionKwh ??
          validatedData.monthlyConsumption ??
          0,
        billType:
          (validatedData.billType as BillData["billType"] | undefined) || "2TD",
        effectiveHours: selectedInstallation.horas_efectivas,
        investmentCostKwh: selectedInstallation.coste_kwh_inversion,
        serviceCostKwh: selectedInstallation.coste_kwh_servicio,
        modality: normalizeInstallationModalidad(
          selectedInstallation.modalidad,
        ),
        selfConsumptionRatio: normalizeSelfConsumption(
          selectedInstallation.porcentaje_autoconsumo,
        ),
        periodPrices,
        periodConsumptions,
        invoiceVariableEnergyAmountEur,
        surplusCompensationPriceKwh:
          selectedInstallation.precio_excedentes_eur_kwh ?? 0,
        maintenanceAnnualPerKwp:
          selectedInstallation.coste_anual_mantenimiento_por_kwp ??
          INVESTMENT_MAINTENANCE_EUR_PER_KWP_YEAR,
        vatRate: 0.21,
        forcedPowerKwp: fixedPower ?? undefined,
      });

      console.log("[calc] ── RESULTADO ──────────────────────────────────────");
      console.log(`  recommendedPowerKwp:      ${result.recommendedPowerKwp} kWp`);
      console.log(`  weightedEnergyPriceKwh:   ${result.weightedEnergyPriceKwh} €/kWh (sin IVA)`);
      console.log(`  invoicePriceWithVatKwh:   ${result.invoicePriceWithVatKwh} €/kWh (con IVA+IE)`);
      console.log(`  annualSelfConsumedKwh:    ${result.annualSelfConsumedEnergyKwh} kWh`);
      console.log(`  annualGrossSolarValue:    ${result.annualGrossSolarValue} €`);
      console.log(`  annualMaintenanceCost:    ${result.annualMaintenanceCost} €`);
      console.log(`  annualSavingsInvestment:  ${result.annualSavingsInvestment} €`);
      console.log(`  investmentCost:           ${result.investmentCost} €`);
      console.log(`  paybackYears:             ${result.paybackYears} años`);
      console.log("[calc] ────────────────────────────────────────────────────");

      setProposalResults({
        investment: result,
        service: result,
      });
      setSelectedProposalView(
        getDefaultProposalMode(selectedInstallation.modalidad),
      );
      setCurrentStep("result");
      sileo.success({ title: "Estudio generado con éxito" });

      void (async () => {
        if (studyPersistLock.current) return;
        studyPersistLock.current = true;

        try {
          await persistStudyAutomatically(
            validatedData,
            result,
            selectedInstallation,
          );

          sileo.success({
            title: t(
              "toasts.study.savedTitle",
              "Propuesta guardada automáticamente",
            ),
            description: t(
              "toasts.study.savedDescription",
              "Cliente, factura, propuesta y estudio registrados.",
            ),
          });
        } catch (error: any) {
          console.error("Error guardando estudio confirmado:", error);
          console.error("error.message:", error?.message);
          console.error("error.response?.data:", error?.response?.data);
          console.error(
            "error.response?.data JSON:",
            JSON.stringify(error?.response?.data ?? null, null, 2),
          );
          console.error("error.response?.status:", error?.response?.status);

          sileo.error({
            title: t(
              "toasts.study.saveErrorTitle",
              "El estudio se generó, pero no se pudo guardar",
            ),
            description:
              error?.response?.data?.details ||
              error?.message ||
              t(
                "toasts.study.saveErrorDescription",
                "Revisa la configuración del servidor.",
              ),
          });
        } finally {
          studyPersistLock.current = false;
        }
      })();
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [
    currentStep,
    extractedData,
    persistStudyAutomatically,
    rawExtraction,
    selectedInstallation,
    setCurrentStep,
    setProposalResults,
    setSelectedProposalView,
    t,
  ]);
}
