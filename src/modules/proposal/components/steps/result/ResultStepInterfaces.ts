import { ProposalMode } from "../../types/proposal.types";




export interface Proposal {
  id: ProposalMode;
  title: string;
  description: string;
  annualSavings: number;
  upfrontCost: number;
  monthlyFee?: number | null;
  recommendedPowerKwp: number;
  annualConsumptionKwh: number;
  valuePoints: string[];
}

export interface SignedReservation {
  reservedKwp: number;
  installationName: string;
  paymentStatus: string;
  signalAmount: number;
}

export interface SignedContractResult {
  reservation?: SignedReservation;
}

export interface FeaturedResumeCard {
  icon: string;
  label: string;
  value: string;
  helper?: string;
}

export interface TopActiveMetric {
  label: string;
  value: string;
  icon: string;
}

export interface ResultStepProps {
  t: (key: string) => string;

  proposalResults: unknown;

  hasMultipleProposalModes: boolean;
  activeProposal: Proposal;
  activeProposalMode: ProposalMode;
  setSelectedProposalView: (mode: ProposalMode) => void;

  topActiveMetrics: TopActiveMetric[];
  featuredResumeCard: FeaturedResumeCard;
  visibleProposalPanels: Proposal[];

  savedStudy: any;
  isGeneratingContract: boolean;
  isSigningContract: boolean;
  contractAlreadySigned: boolean;

  reserveCardTitle: string;
  reserveCardDescription: string;
  activeModeLabelLower: string;
  reserveButtonText: string;

  signedContractResult?: SignedContractResult | null;

  handleGenerateContract: () => void;
  handleDownloadPDF: () => void;

  formatCurrency: (value: number) => string;
  formatNumber: (value: number) => string;
  normalizeFeatureList: (list: string[], targetLength: number) => (string | null)[];
}
