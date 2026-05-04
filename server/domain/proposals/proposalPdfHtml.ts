import { readFileSync } from "node:fs";

import type { CalculationResult } from "../../../src/entities/proposal/application/calculateProposal.usecase";
import type { ProposalPdfSummary, AppLanguage } from "../../../src/entities/proposal/domain/proposalPdf.types";
import type { BillData } from "../../../src/shared/lib/validators";

type ProposalPdfPayload = {
  billData: BillData;
  calculationResult: CalculationResult;
  language?: AppLanguage;
  proposals: ProposalPdfSummary[];
};

type TemplateValues = {
  clientName: string;
  clientMeta: string;
  annualConsumption: string;
  tariff: string;
  currentAnnualCost: string;
  plantName: string;
  currentEnergyPrice: string;
  currentBaseEnergyPrice: string;
  bestDiscountText: string;
  serviceDiscount: string;
  investmentDiscount: string;
  serviceEnergyPrice: string;
  investmentEnergyPrice: string;
  serviceAnnualCost: string;
  investmentAnnualCost: string;
  serviceMonthlyFee: string;
  investmentUpfrontCost: string;
  serviceAnnualSavings: string;
  investmentAnnualSavings: string;
  serviceTotalSavings: string;
  investmentTotalSavings: string;
  investmentPayback: string;
  recommendedPower: string;
  panelCount: string;
  annualProduction: string;
  energy25Years: string;
  co2Avoided: string;
  treesEquivalent: string;
  dieselKmAvoided: string;
  investmentCardDescription: string;
  contact: string;
};

const TEMPLATE_HTML = readFileSync(
  new URL("./participationReportTemplate.html", import.meta.url),
  "utf8",
);

const LOCALES: Record<AppLanguage, string> = {
  ca: "ca-ES",
  es: "es-ES",
  gl: "gl-ES",
  val: "ca-ES",
};

const PROJECTION_YEARS = 25;

function normalizeLanguage(language?: AppLanguage): AppLanguage {
  return language && language in LOCALES ? language : "es";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function replaceText(html: string, search: string, value: string): string {
  return html.split(search).join(escapeHtml(value));
}

function positive(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 99);
}

function formatNumber(
  value: number,
  language: AppLanguage,
  maximumFractionDigits = 0,
  minimumFractionDigits = maximumFractionDigits,
): string {
  return new Intl.NumberFormat(LOCALES[language], {
    maximumFractionDigits,
    minimumFractionDigits,
  }).format(value);
}

function formatCurrency(
  value: number,
  language: AppLanguage,
  maximumFractionDigits = 0,
): string {
  return `${formatNumber(value, language, maximumFractionDigits)} €`;
}

function formatEnergyPrice(value: number, language: AppLanguage): string {
  return formatNumber(value, language, 3, 3);
}

function formatKwh(value: number, language: AppLanguage): string {
  return `${formatNumber(value, language, 0)} kWh`;
}

function formatMonthYear(language: AppLanguage): string {
  return new Intl.DateTimeFormat(LOCALES[language], {
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function fullName(billData: BillData): string {
  return [billData.name, billData.lastName].filter(Boolean).join(" ").trim() || "Cliente";
}

function locationFromAddress(address?: string): string {
  if (!address) return "Ubicación pendiente";

  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) return parts.slice(-2).join(" · ");
  return parts[0] || "Ubicación pendiente";
}

function contractedPower(billData: BillData, language: AppLanguage): string {
  if (billData.contractedPowerText?.trim()) return billData.contractedPowerText.trim();

  const power =
    positive(billData.contractedPowerKw) ||
    positive(billData.contractedPowerP1) ||
    positive(billData.contractedPowerP2);

  return power ? `${formatNumber(power, language, 1, 1)} kW` : "-";
}

function findProposal(
  proposals: ProposalPdfSummary[],
  mode: ProposalPdfSummary["mode"],
): ProposalPdfSummary | undefined {
  return proposals.find((proposal) => proposal.mode === mode);
}

function annualCost(currentAnnualCost: number, annualSavings: number): number {
  return Math.max(currentAnnualCost - positive(annualSavings), 0);
}

function priceFromAnnualCost(annualCostValue: number, annualConsumptionKwh: number): number {
  return annualConsumptionKwh > 0 ? annualCostValue / annualConsumptionKwh : 0;
}

function discountFromPrice(currentPrice: number, proposedPrice: number): number {
  return currentPrice > 0 ? clampPercent(Math.round((1 - proposedPrice / currentPrice) * 100)) : 0;
}

function buildTemplateValues(payload: ProposalPdfPayload, language: AppLanguage): TemplateValues {
  const { billData, calculationResult: result, proposals } = payload;
  const service = findProposal(proposals, "service");
  const investment = findProposal(proposals, "investment");
  const preferred = investment ?? service ?? proposals[0];

  const annualConsumptionKwh = positive(
    preferred?.annualConsumptionKwh,
    positive(result.annualConsumptionKwh),
  );
  const currentPrice = positive(
    result.invoicePriceWithVatKwh,
    positive(result.weightedEnergyPriceKwh),
  );
  const currentAnnualCost = positive(
    result.estimatedAnnualInvoiceCost,
    annualConsumptionKwh * currentPrice,
  );

  const serviceAnnualSavings = positive(
    service?.annualSavings,
    positive(result.annualSavingsService),
  );
  const investmentAnnualSavings = positive(
    investment?.annualSavings,
    positive(result.annualSavingsInvestment),
  );

  const serviceAnnualCost = annualCost(currentAnnualCost, serviceAnnualSavings);
  const investmentAnnualCost = annualCost(currentAnnualCost, investmentAnnualSavings);
  const serviceEnergyPrice = priceFromAnnualCost(serviceAnnualCost, annualConsumptionKwh);
  const investmentEnergyPrice = priceFromAnnualCost(investmentAnnualCost, annualConsumptionKwh);

  const serviceDiscount = discountFromPrice(currentPrice, serviceEnergyPrice);
  const investmentDiscount = discountFromPrice(currentPrice, investmentEnergyPrice);
  const bestDiscount = Math.max(serviceDiscount, investmentDiscount);

  const recommendedPowerKwp = positive(
    preferred?.recommendedPowerKwp,
    positive(result.recommendedPowerKwp),
  );
  const annualProductionKwh = positive(
    result.estimatedAnnualProductionKwh,
    recommendedPowerKwp * 1250,
  );
  const energy25Mwh = (annualProductionKwh * PROJECTION_YEARS) / 1000;
  const co2Tons = energy25Mwh * 0.245;
  const trees = co2Tons * 66.5;
  const dieselKm = co2Tons * 4180;

  const monthlyFee = positive(service?.monthlyFee, positive(result.annualServiceFee) / 12);
  const upfrontCost = positive(investment?.upfrontCost, positive(result.investmentCost));
  const investmentPaybackYears = positive(
    investment?.paybackYears,
    positive(result.paybackYears),
  );
  const contact = [preferred?.companyPhone, preferred?.companyEmail].filter(Boolean).join(" · ");

  return {
    clientName: fullName(billData),
    clientMeta: `${locationFromAddress(billData.address)} · ${formatMonthYear(language)}`,
    annualConsumption: `${formatKwh(annualConsumptionKwh, language)}/año`,
    tariff: `${billData.billType.replace("TD", ".0TD")} · ${contractedPower(billData, language)}`,
    currentAnnualCost: `${formatCurrency(currentAnnualCost, language)}/año`,
    plantName: preferred?.installationName || preferred?.installationAddress || "Planta asignada",
    currentEnergyPrice: formatEnergyPrice(currentPrice, language),
    currentBaseEnergyPrice: `${formatEnergyPrice(positive(result.weightedEnergyPriceKwh, currentPrice), language)} € + impuestos`,
    bestDiscountText: `hasta un ${bestDiscount}% más barato`,
    serviceDiscount: `−${serviceDiscount}%`,
    investmentDiscount: `−${investmentDiscount}%`,
    serviceEnergyPrice: formatEnergyPrice(serviceEnergyPrice, language),
    investmentEnergyPrice: formatEnergyPrice(investmentEnergyPrice, language),
    serviceAnnualCost: `${formatCurrency(serviceAnnualCost, language)}/año`,
    investmentAnnualCost: `${formatCurrency(investmentAnnualCost, language)}/año`,
    serviceMonthlyFee: formatCurrency(monthlyFee, language),
    investmentUpfrontCost: formatCurrency(upfrontCost, language),
    serviceAnnualSavings: formatCurrency(serviceAnnualSavings, language),
    investmentAnnualSavings: formatCurrency(investmentAnnualSavings, language),
    serviceTotalSavings: formatCurrency(
      positive(service?.totalSavings25Years, positive(result.totalSavings25YearsService)),
      language,
    ),
    investmentTotalSavings: formatCurrency(
      positive(investment?.totalSavings25Years, positive(result.totalSavings25YearsInvestment)),
      language,
    ),
    investmentPayback: investmentPaybackYears
      ? `${formatNumber(investmentPaybackYears, language, 1, 1)} años`
      : "-",
    recommendedPower: formatNumber(recommendedPowerKwp, language, 1, 1),
    panelCount: `${formatNumber(Math.max(Math.round(recommendedPowerKwp / 0.5), 1), language, 0)} uds.`,
    annualProduction: formatKwh(annualProductionKwh, language),
    energy25Years: `${formatNumber(energy25Mwh, language, 0)} MWh`,
    co2Avoided: `${formatNumber(co2Tons, language, 1, 1)} t`,
    treesEquivalent: formatNumber(trees, language, 0),
    dieselKmAvoided: `${formatNumber(dieselKm, language, 0)} km`,
    investmentCardDescription: `Máxima rentabilidad. Retorno en ${
      investmentPaybackYears ? `${formatNumber(investmentPaybackYears, language, 1, 1)} años` : "-"
    }. Ahorro acumulado 25 años: ${formatCurrency(
      positive(investment?.totalSavings25Years, positive(result.totalSavings25YearsInvestment)),
      language,
    )}.`,
    contact: contact || "Contacto pendiente",
  };
}

export function buildProposalPdfHtml(payload: ProposalPdfPayload): string {
  const language = normalizeLanguage(payload.language);
  const values = buildTemplateValues(payload, language);

  const replacements: Array<[string, string]> = [
    ["Eliseo C. Otero", values.clientName],
    ["Ames · A Coruña · 04/2026", values.clientMeta],
    ["4.150 kWh/año", values.annualConsumption],
    ["2.0TD · 4,4 kW", values.tariff],
    ["816 €/año", values.currentAnnualCost],
    ["CE-15220-01", values.plantName],
    ["0,197", values.currentEnergyPrice],
    ["0,165 € + impuestos", values.currentBaseEnergyPrice],
    ["hasta un 73% más barato", values.bestDiscountText],
    ["−41%", values.serviceDiscount],
    ["−73%", values.investmentDiscount],
    ["0,117", values.serviceEnergyPrice],
    ["486 €/año", values.serviceAnnualCost],
    ["22 €/mes · sin entrada", `${values.serviceMonthlyFee}/mes · sin entrada`],
    ["22 €", values.serviceMonthlyFee],
    ["0,053", values.investmentEnergyPrice],
    ["222 €/año", values.investmentAnnualCost],
    ["4.593 € · pago único", `${values.investmentUpfrontCost} · pago único`],
    ["4.593 €", values.investmentUpfrontCost],
    ["330 €", values.serviceAnnualSavings],
    ["594 €", values.investmentAnnualSavings],
    ["12.050 €", values.serviceTotalSavings],
    ["21.658 €", values.investmentTotalSavings],
    ["7,7 años", values.investmentPayback],
    ["4,0", values.recommendedPower],
    ["8 uds.", values.panelCount],
    ["4.492 kWh", values.annualProduction],
    ["27,5 t", values.co2Avoided],
    ["1.830", values.treesEquivalent],
    ["112 MWh", values.energy25Years],
    ["115.000 km", values.dieselKmAvoided],
    [
      "Máxima rentabilidad. Retorno en 7,7 años. Ahorro acumulado 25 años: 21.658 €.",
      values.investmentCardDescription,
    ],
    ["900 123 456 · hola@solarcomun.coop", values.contact],
  ];

  return replacements.reduce(
    (html, [search, value]) => replaceText(html, search, value),
    TEMPLATE_HTML,
  );
}
