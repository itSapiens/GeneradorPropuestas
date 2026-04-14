import { formatCurrency, formatNumber } from "@/src/lib/utils";
import { ApiInstallation, GeneratedContractResponse, ProposalCardData, ProposalMode, SignedContractResponse, StudyComparisonResult } from "@/src/modules/proposal/components/types/proposal.types";
import { getAvailableProposalModes, getDefaultProposalMode, normalizeInstallationModalidad } from "@/src/modules/proposal/components/utils/proposalModes";
import { formatPaybackYears } from "@/src/modules/proposal/components/utils/proposalNumbers";


interface UseProposalResultStateParams {
  proposalResults: StudyComparisonResult | null;
  selectedInstallation: ApiInstallation | null;
  selectedProposalView: ProposalMode;
  setSelectedProposalView: React.Dispatch<React.SetStateAction<ProposalMode>>;
  signedContractResult: SignedContractResponse | null;
  generatedContract: GeneratedContractResponse | null;
  t: (key: string, fallback?: string, options?: any) => string;
  buildProposalCardData: (
    result: any,
    mode: ProposalMode,
    installation: ApiInstallation | null,
    t: (key: string, fallback?: string, options?: any) => string,
  ) => ProposalCardData;
}

export function useProposalResultState({
  proposalResults,
  selectedInstallation,
  selectedProposalView,
  setSelectedProposalView,
  signedContractResult,
  generatedContract,
  t,
  buildProposalCardData,
}: UseProposalResultStateParams) {
  const investmentResult = proposalResults?.investment ?? null;
  const serviceResult =
    proposalResults?.service ?? proposalResults?.investment ?? null;

  const normalizedInstallationModalidad = normalizeInstallationModalidad(
    selectedInstallation?.modalidad,
  );

  const availableProposalModes = getAvailableProposalModes(
    normalizedInstallationModalidad,
  );

  const defaultProposalMode = getDefaultProposalMode(
    normalizedInstallationModalidad,
  );

  const hasMultipleProposalModes = availableProposalModes.length > 1;

  const activeProposalMode: ProposalMode = availableProposalModes.includes(
    selectedProposalView,
  )
    ? selectedProposalView
    : defaultProposalMode;

  const activeCalculationResult =
    activeProposalMode === "service"
      ? (serviceResult ?? investmentResult)
      : investmentResult;

  const investmentProposal = buildProposalCardData(
    investmentResult,
    "investment",
    selectedInstallation,
    t,
  );

  const serviceProposal = buildProposalCardData(
    serviceResult,
    "service",
    selectedInstallation,
    t,
  );

  const contractAlreadySigned = Boolean(signedContractResult?.contract?.id);

  const getMonthlyFeeLabel = (
    proposal: ProposalCardData,
    isInvestment = false,
  ) => {
    if (isInvestment) return "Sin cuota";

    return proposal.monthlyFee && proposal.monthlyFee > 0
      ? `${formatCurrency(proposal.monthlyFee)} / mes`
      : "Consultar";
  };

  const getPaybackLabel = (proposal: ProposalCardData) => {
    return formatPaybackYears(proposal.paybackYears);
  };

  const getProposalMetrics = (proposal: ProposalCardData) => ({
    annualSavings: formatCurrency(proposal.annualSavings),
    totalSavings25Years: formatCurrency(proposal.totalSavings25Years),
    upfrontCost: formatCurrency(proposal.upfrontCost),
    monthlyFee: getMonthlyFeeLabel(proposal, proposal.id === "investment"),
    payback: getPaybackLabel(proposal),
  });

  const activeProposal =
    activeProposalMode === "service" ? serviceProposal : investmentProposal;

  const activeModeLabel = activeProposal.title;
  const activeModeLabelLower = activeModeLabel.toLowerCase();

  const contractPreviewModeLabel =
    generatedContract?.preview?.proposalMode === "service"
      ? t("result.modes.service", "Servicio").toLowerCase()
      : t("result.modes.investment", "Inversión").toLowerCase();

  const reserveCardTitle = contractAlreadySigned
    ? t("result.reserve.startedTitle")
    : activeProposal.id === "investment"
      ? t("result.reserve.investment.title")
      : t("result.reserve.service.title");

  const reserveCardDescription = contractAlreadySigned
    ? activeProposal.id === "investment"
      ? t("result.reserve.startedDescriptionInvestment")
      : t("result.reserve.startedDescriptionService")
    : activeProposal.id === "investment"
      ? t("result.reserve.investment.description")
      : t("result.reserve.service.description");

  const reserveButtonText = contractAlreadySigned
    ? t("result.reserve.reserved")
    : activeProposal.id === "investment"
      ? t("result.reserve.investment.title")
      : t("result.reserve.service.title");

  const proposalByMode: Record<ProposalMode, ProposalCardData> = {
    investment: investmentProposal,
    service: serviceProposal,
  };

  const visibleProposalPanels = availableProposalModes.map(
    (mode) => proposalByMode[mode],
  );

  const topSecondaryResumeCard = {
    label: t("result.summary.annualSavings"),
    value: formatCurrency(activeProposal.annualSavings),
    helper: t("result.summary.monthlySavingsHelper", {
      value: formatCurrency(activeProposal.annualSavings / 12),
    }),
    icon: "solar:graph-up-bold-duotone",
  };

  const topActiveMetrics = [
    {
      label: t("result.summary.investment"),
      value:
        activeProposal.id === "investment"
          ? formatCurrency(activeProposal.upfrontCost)
          : t("result.summary.noInitialInvestment"),
      icon: "solar:calculator-bold-duotone",
    },
    {
      label:
        activeProposal.id === "investment"
          ? t("result.summary.return")
          : t("result.summary.monthlyFee"),
      value:
        activeProposal.id === "investment"
          ? activeProposal.paybackYears > 0
            ? `${Math.round(activeProposal.paybackYears)} ${t("result.units.years")}`
            : "-"
          : activeProposal.monthlyFee && activeProposal.monthlyFee > 0
            ? `${formatCurrency(activeProposal.monthlyFee)} / ${t("result.units.month")}`
            : t("result.summary.noFee"),
      icon:
        activeProposal.id === "investment"
          ? "solar:graph-up-bold-duotone"
          : "solar:wallet-money-bold-duotone",
    },
    {
      label: t("result.summary.recommendedPower"),
      value: `${formatNumber(activeProposal.recommendedPowerKwp)} kWp`,
      icon: "solar:bolt-bold-duotone",
    },
    {
      label: t("result.summary.annualConsumption"),
      value: `${Math.round(activeProposal.annualConsumptionKwh)} kWh`,
      icon: "solar:chart-2-bold-duotone",
    },
  ];

  const featuredResumeCard = topSecondaryResumeCard;

  return {
    investmentResult,
    serviceResult,
    availableProposalModes,
    defaultProposalMode,
    hasMultipleProposalModes,
    activeProposalMode,
    activeCalculationResult,
    investmentProposal,
    serviceProposal,
    activeProposal,
    activeModeLabelLower,
    contractPreviewModeLabel,
    contractAlreadySigned,
    reserveCardTitle,
    reserveCardDescription,
    reserveButtonText,
    visibleProposalPanels,
    topActiveMetrics,
    featuredResumeCard,
  };
}