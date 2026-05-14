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
  companyLogoBucket?: string | null;
  companyLogoPath?: string | null;
  companyLogoMimeType?: string | null;
  companyPdfColorPrimario?: string | null;
  companyPdfColorSecundario?: string | null;
  companyPdfColorAcento?: string | null;
  companyPdfColorTexto?: string | null;
  companyPdfColorFondoPagina?: string | null;
  companyPdfColorFondoCard?: string | null;
  companyPdfFraseInicio?: string | null;
  companyPdfFraseDestacada?: string | null;
  companyPdfFraseFinal?: string | null;
  energyPriceKwh?: number | null;
}
