import { getAllowedProposalModes, type AppLanguage, type ProposalMode } from "./contractLocalization";
import { resolveReservationAmountForInstallation } from "../installations/installationPolicy";
import { toPositiveNumber } from "../../utils/parsingUtils";

export type ContractCommercialSummary = {
  annualMaintenance: number;
  availableModes: ProposalMode[];
  investmentPrice: number | null;
  reservationAmount: number;
  reservationMode: "fija" | "segun_potencia";
  selectedMode: ProposalMode;
  selectedPrice: number | null;
  selectedPriceUnit: "one_time" | "monthly";
  serviceMonthlyFee: number | null;
};

function getFixedPaymentAmount(installation: any): number | null {
  const paymentMode = String(installation?.pago ?? "").trim().toLowerCase();
  const fixedAmount = toPositiveNumber(installation?.cantidad_precio_fijo);

  if (paymentMode !== "fijo") return null;
  return fixedAmount;
}

function getPositiveNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = toPositiveNumber(value);
    if (parsed !== null) return parsed;
  }

  return null;
}

export function buildContractCommercialSummary(params: {
  assignedKwp: number;
  installation: any;
  proposalMode: ProposalMode;
  study?: any;
}) : ContractCommercialSummary {
  const availableModes = getAllowedProposalModes(params.installation?.modalidad);
  const fixedPaymentAmount = getFixedPaymentAmount(params.installation);
  const effectiveHours = getPositiveNumber(params.installation?.horas_efectivas) ?? 0;
  const investmentCostPerKwh =
    getPositiveNumber(params.installation?.coste_kwh_inversion) ?? 0;
  const annualConsumptionKwh =
    getPositiveNumber(
      params.study?.calculation?.annualConsumptionKwh,
      params.study?.calculation?.averageMonthlyConsumptionKwh
        ? Number(params.study.calculation.averageMonthlyConsumptionKwh) * 12
        : null,
    ) ?? 0;
  const serviceCostPerKwh =
    getPositiveNumber(params.installation?.coste_kwh_servicio) ?? 0;


    //precio/coste inversion con comprobadores 
  const investmentPrice =
    fixedPaymentAmount ??
    (params.assignedKwp > 0 && effectiveHours > 0 && investmentCostPerKwh > 0
      ? investmentCostPerKwh * params.assignedKwp * effectiveHours * 25
      : getPositiveNumber(
          params.study?.calculation?.investmentTotal,
          params.study?.calculation?.investmentCost,
        ));


        // precio/cost e servicio
  const serviceMonthlyFee =
    fixedPaymentAmount ??
    getPositiveNumber(
      params.study?.calculation?.serviceMonthlyFee,
      params.study?.calculation?.monthlyFee,
      params.study?.calculation?.serviceCost
        ? Number(params.study.calculation.serviceCost) / 12
        : null,
      params.study?.calculation?.annualServiceFee
        ? Number(params.study.calculation.annualServiceFee) / 12
        : null,
      annualConsumptionKwh > 0 && serviceCostPerKwh > 0
        ? (annualConsumptionKwh * serviceCostPerKwh) / 12
        : null,
    );

  const reservation = resolveReservationAmountForInstallation({
    assignedKwp: params.assignedKwp,
    fallbackAmount: params.study?.calculation?.signalAmount ?? null,
    installation: params.installation,
  });

  const annualMaintenancePerKwp =
    getPositiveNumber(params.installation?.coste_anual_mantenimiento_por_kwp) ?? 0;
  const annualMaintenance =
    annualMaintenancePerKwp > 0 && params.assignedKwp > 0
      ? annualMaintenancePerKwp * params.assignedKwp
      : 0;

  return {
    annualMaintenance,
    availableModes,
    investmentPrice: availableModes.includes("investment") ? (investmentPrice ?? null) : null,
    reservationAmount: reservation.signalAmount,
    reservationMode: reservation.reservationMode,
    selectedMode: params.proposalMode,
    selectedPrice:
      params.proposalMode === "service"
        ? serviceMonthlyFee ?? null
        : investmentPrice ?? null,
    selectedPriceUnit: params.proposalMode === "service" ? "monthly" : "one_time",
    serviceMonthlyFee: availableModes.includes("service") ? (serviceMonthlyFee ?? null) : null,
  };
}

export function getContractCommercialModeLabel(
  summary: ContractCommercialSummary,
  language: AppLanguage,
) {
  return summary.selectedMode === "service"
    ? language === "gl"
      ? "Servizo"
      : "Servicio"
    : "Inversión";
}
