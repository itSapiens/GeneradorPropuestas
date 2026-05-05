import { CalculationResult } from "@/src/entities/proposal/application/calculateProposal.usecase";
import { ApiInstallation, ProposalCardData } from "@/src/entities/proposal/domain/proposal.types";
import { TFunction } from "i18next";
import {
  getFixedInstallationPower,
  getInvestmentRealCostFromFormula,
  getServiceMonthlyFeeFromResult,
} from "./proposalCalculation";
import { getFirstNumericField } from "@/src/features/proposal-flow/lib/proposalNumbers";
import { INVESTMENT_MAINTENANCE_EUR_PER_KWP_YEAR } from "@/src/shared/lib/constants/proposal.constants";

export function buildProposalCardData(
  result: CalculationResult | null,
  mode: "investment" | "service",
  installation: ApiInstallation | null,
  t: TFunction,
): ProposalCardData {
const recommendedPowerKwp = getDisplayedRecommendedPowerKwp(
  result,
  installation,
);

  const annualConsumptionKwh = getFirstNumericField(result, [
    "annualConsumptionKwh",
  ]);

  if (mode === "investment") {
    const annualSavings = getFirstNumericField(result, [
      "annualSavingsInvestment",
      "annualSavings",
    ]);

    const annualMaintenance = getFirstNumericField(
      result,
      ["annualMaintenanceCost"],
      recommendedPowerKwp > 0
        ? INVESTMENT_MAINTENANCE_EUR_PER_KWP_YEAR * recommendedPowerKwp
        : 0,
    );

    const monthlyMaintenance =
      annualMaintenance > 0 ? annualMaintenance / 12 : null;

    const upfrontCost = getInvestmentRealCostFromFormula(
      installation,
      recommendedPowerKwp,
    );

    const totalSavings25Years = getFirstNumericField(
      result,
      [
        "totalSavings25YearsInvestment",
        "annualSavings25YearsInvestment",
        "investmentSavings25Years",
        "totalSavings25Years",
      ],
      annualSavings * 25,
    );

    const paybackYears = annualSavings > 0 ? upfrontCost / annualSavings : 0;

    return {
      id: "investment",
      title: t("result.modes.investment"),
      badge: t("result.proposals.investment.badge"),
      annualSavings,
      totalSavings25Years,
      upfrontCost,
      monthlyFee: null,
      annualMaintenance,
      monthlyMaintenance,
      paybackYears,
      recommendedPowerKwp,
      annualConsumptionKwh,
      description: t("result.proposals.investment.description"),
      valuePoints: [
        t("result.proposals.investment.points.0"),
        t("result.proposals.investment.points.1"),
        t("result.proposals.investment.points.2"),
        t("result.proposals.investment.points.3"),
      ],
    };
  }

  const annualSavings = getFirstNumericField(result, [
    "annualSavingsService",
    "serviceAnnualSavings",
    "annualSavings",
  ]);

  const totalSavings25Years = getFirstNumericField(
    result,
    [
      "totalSavings25YearsService",
      "annualSavings25YearsService",
      "serviceSavings25Years",
      "serviceTotalSavings25Years",
    ],
    annualSavings * 25,
  );

  const monthlyFee = getServiceMonthlyFeeFromResult(result);

  const paybackYears = getFirstNumericField(result, [
    "servicePaybackYears",
    "paybackYearsService",
  ]);

  return {
    id: "service",
    title: t("result.modes.service"),
    badge: t("result.proposals.service.badge"),
    annualSavings,
    totalSavings25Years,
    upfrontCost: 0,
    monthlyFee,
    annualMaintenance: 0,
    monthlyMaintenance: null,
    paybackYears,
    recommendedPowerKwp,
    annualConsumptionKwh,
    description: t("result.proposals.service.description"),
    valuePoints: [
      t("result.proposals.service.points.0"),
      t("result.proposals.service.points.1"),
      t("result.proposals.service.points.2"),
    ],
  };
}


export function getDisplayedRecommendedPowerKwp(
  result: CalculationResult | null,
  installation: ApiInstallation | null,
): number {
  const fixedPower = getFixedInstallationPower(installation);

  if (fixedPower !== null) {
    return fixedPower;
  }

  return getFirstNumericField(result, ["recommendedPowerKwp"], 0);
}

export function buildEconomicChartData(
  investmentProposal: ProposalCardData,
  serviceProposal: ProposalCardData,
) {
  const investmentRecurring = investmentProposal.annualMaintenance || 0;
  const serviceRecurring = (serviceProposal.monthlyFee ?? 0) * 12;

  const investmentNet25 =
    investmentProposal.totalSavings25Years - investmentProposal.upfrontCost;

  const serviceNet25 = serviceProposal.totalSavings25Years;

  return [
    {
      name: "Entrada",
      inversion: Number(investmentProposal.upfrontCost.toFixed(2)),
      servicio: 0,
    },
    {
      name: "Coste anual",
      inversion: Number(investmentRecurring.toFixed(2)),
      servicio: Number(serviceRecurring.toFixed(2)),
    },
    {
      name: "Balance 25 años",
      inversion: Number(investmentNet25.toFixed(2)),
      servicio: Number(serviceNet25.toFixed(2)),
    },
  ];
}
export function normalizeFeatureList(items: string[], total = 4) {
  const normalized = [...items];

  while (normalized.length < total) {
    normalized.push("");
  }

  return normalized;
}


