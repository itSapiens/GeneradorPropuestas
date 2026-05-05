export type ProposalPdfMode = "investment" | "service";
export type AppLanguage = "es" | "ca" | "val" | "gl";

export interface ProposalPdfSummary {
  mode: ProposalPdfMode;
  title: string;
  badge: string;
  annualSavings: number;
  totalSavings25Years: number;
  upfrontCost: number;
  monthlyFee: number | null;
  annualMaintenance: number;
  paybackYears: number;
  recommendedPowerKwp: number;
  annualConsumptionKwh: number;
  description: string;
  installationAddress?: string | null;
  installationName?: string | null;
  companyName?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
  energyPriceKwh?: number | null;
}
