import { ExtractedBillData } from "@/src/entities/proposal/domain/proposal.types";
import { ApiInstallation, ValidationBillData } from "@/src/entities/proposal/domain/proposal.types";
import { BillData } from "@/src/shared/lib/validators";
import {
  buildPeriodConsumptionsFromValidatedData,
  buildPeriodPricesFromValidatedData,
  getInvoiceTotalAmountFromExtraction,
  getInvoiceVariableEnergyAmountFromExtraction,
} from "./extractionMappers";
import { getFirstNumericField, parseNumericValue } from "@/src/features/proposal-flow/lib/proposalNumbers";
import {
  CalculationResult,
  calculateEnergyStudy,
} from "@/src/entities/proposal/application/calculateProposal.usecase";
import { normalizeInstallationModalidad } from "./proposalModes";
import {
  DEFAULT_SURPLUS_COMPENSATION_EUR_KWH,
  INVESTMENT_MAINTENANCE_EUR_PER_KWP_YEAR,
} from "@/src/shared/lib/constants/proposal.constants";

export function getFixedInstallationPower(
  installation: ApiInstallation | null | undefined,
): number | null {
  // Solo se usa la potencia fija cuando la instalación lo indica explícitamente.
  const calculoMode = (installation?.calculo_estudios ?? "").toLowerCase().trim();
  if (calculoMode !== "fijo") return null;

  const fixed = Number(installation?.potencia_fija_kwp ?? 0);

  if (!Number.isFinite(fixed)) return null;
  if (fixed <= 0) return null;

  return fixed;
}


export function resolveEffectiveAssignedKwpForInstallation(
  validatedData: ValidationBillData,
  installation: ApiInstallation,
  rawExtraction: ExtractedBillData | null,
): number {
  const fixedPower = getFixedInstallationPower(installation);

  if (fixedPower !== null) {
    return fixedPower;
  }

  return calculateRequiredKwpForInstallation(
    validatedData,
    installation,
    rawExtraction,
  );
}

export function displayPercentage(value: number | null | undefined): number {
  const normalized = normalizeSelfConsumption(value);
  return Math.round(normalized * 100);
}
export function normalizeSelfConsumption(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0.7;
  return value > 1 ? value / 100 : value;
}

export function calculateRequiredKwpForInstallation(
  validatedData: ValidationBillData,
  installation: ApiInstallation,
  rawExtraction: ExtractedBillData | null,
): number {
  const periodPrices = buildPeriodPricesFromValidatedData(validatedData);

  const periodConsumptions =
    buildPeriodConsumptionsFromValidatedData(validatedData);

  const invoiceVariableEnergyAmountEur =
    getInvoiceVariableEnergyAmountFromExtraction(rawExtraction);
  const invoiceTotalAmountEur =
    getInvoiceTotalAmountFromExtraction(rawExtraction);



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

    effectiveHours: installation.horas_efectivas,
    investmentCostKwh: installation.coste_kwh_inversion,
    serviceCostKwh: installation.coste_kwh_servicio,

    modality: normalizeInstallationModalidad(installation.modalidad),

    selfConsumptionRatio: normalizeSelfConsumption(
      installation.porcentaje_autoconsumo,
    ),

    periodPrices,
    periodConsumptions,
    invoiceVariableEnergyAmountEur,
    invoiceTotalAmountEur:
      validatedData.invoiceTotalAmountEur ?? invoiceTotalAmountEur,
    billedDays: validatedData.billedDays,

    // Precio excedentes: valor de BD si existe, si no el precio regulado por defecto (0.05 €/kWh)
    surplusCompensationPriceKwh: installation.precio_excedentes_eur_kwh ?? DEFAULT_SURPLUS_COMPENSATION_EUR_KWH,

    maintenanceAnnualPerKwp:
      installation.coste_anual_mantenimiento_por_kwp ??
      INVESTMENT_MAINTENANCE_EUR_PER_KWP_YEAR,

    vatRate: 0.21,
  });

  return getFirstNumericField(result, ["recommendedPowerKwp"], 0);
}

export function getServiceMonthlyFeeFromInstallation(
  installation: ApiInstallation | null,
  annualConsumptionKwh: number,
): number | null {
  if (!installation) return null;

  const directMonthlyFee = getFirstNumericField(
    installation,
    [
      "serviceMonthlyFee",
      "monthlyServiceFee",
      "precio_mensual_servicio",
      "cuota_mensual_servicio",
    ],
    Number.NaN,
  );

  if (Number.isFinite(directMonthlyFee)) {
    return directMonthlyFee;
  }

  const serviceCostPerKwh = installation.coste_kwh_servicio;

  if (
    typeof serviceCostPerKwh === "number" &&
    Number.isFinite(serviceCostPerKwh) &&
    annualConsumptionKwh > 0
  ) {
    return (annualConsumptionKwh * serviceCostPerKwh) / 12;
  }

  return null;
}
export function getInvestmentCostFromFormula(
  installation: ApiInstallation | null,
  recommendedPowerKwp: number,
): number {
  if (!installation) return 0;

  const effectiveHours = parseNumericValue(installation.horas_efectivas);
  const investmentCostPerKwh = parseNumericValue(
    installation.coste_kwh_inversion,
  );

  if (
    !Number.isFinite(recommendedPowerKwp) ||
    recommendedPowerKwp <= 0 ||
    !Number.isFinite(effectiveHours) ||
    effectiveHours <= 0 ||
    !Number.isFinite(investmentCostPerKwh) ||
    investmentCostPerKwh <= 0
  ) {
    return 0;   
  }

  return investmentCostPerKwh * recommendedPowerKwp * effectiveHours * 25;
}

export function getInvestmentRealCostFromFormula(
  installation: ApiInstallation | null,
  recommendedPowerKwp: number,
): number {
  if (!installation) return 0;

  const baseInvestmentCost = getInvestmentCostFromFormula(
    installation,
    recommendedPowerKwp,
  );

  const annualMaintenancePerKwp = parseNumericValue(
    installation.coste_anual_mantenimiento_por_kwp,
  );

  if (
    !Number.isFinite(baseInvestmentCost) ||
    baseInvestmentCost <= 0 ||
    !Number.isFinite(recommendedPowerKwp) ||
    recommendedPowerKwp <= 0
  ) {
    return 0;
  }

  const maintenance25Years =
    annualMaintenancePerKwp * recommendedPowerKwp * 25;

  return Math.max(baseInvestmentCost, 0);
}

export function getServiceMonthlyFeeFromResult(
  result: CalculationResult | null,
): number | null {
  if (!result) return null;

  const annualServiceFee = getFirstNumericField(result, [
    "annualServiceFee",
    "serviceCost",
  ]);

  if (!Number.isFinite(annualServiceFee) || annualServiceFee <= 0) {
    return null;
  }

  return annualServiceFee / 12;
}

export function getAnnualMaintenanceFromInstallation(
  installation: ApiInstallation | null,
  recommendedPowerKwp: number,
): number {
  if (!installation) return 0;

  const directAnnualMaintenance = getFirstNumericField(
    installation,
    [
      "annualMaintenance",
      "maintenanceAnnual",
      "mantenimiento_anual",
      "coste_anual_mantenimiento",
    ],
    Number.NaN,
  );

  if (Number.isFinite(directAnnualMaintenance)) {
    return directAnnualMaintenance;
  }

  const maintenancePerKwp = installation.coste_anual_mantenimiento_por_kwp;

  if (
    typeof maintenancePerKwp === "number" &&
    Number.isFinite(maintenancePerKwp) &&
    recommendedPowerKwp > 0
  ) {
    return maintenancePerKwp * recommendedPowerKwp;
  }

  return 0;
}





