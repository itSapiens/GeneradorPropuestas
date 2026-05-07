import { readFileSync } from "node:fs";

import type { CalculationResult } from "../../../src/entities/proposal/application/calculateProposal.usecase";
import type { ProposalPdfSummary, AppLanguage } from "../../../src/entities/proposal/domain/proposalPdf.types";
import type { BillData } from "../../../src/shared/lib/validators";
import {
  fillTranslationTemplate,
  getProposalPdfTexts,
} from "../contracts/contractLocalization";

type ProposalPdfPayload = {
  billData: BillData;
  calculationResult: CalculationResult;
  continueContractUrl?: string | null;
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
  companyName: string;
  companyEmail: string;
  reserveHref: string;
  stabilityChartHtml: string;
  stabilityGraphHtml: string;
  recommendedMode: ProposalPdfSummary["mode"] | null;
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
const PROJECTION_IPC_RATE = 0.02;

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

function replaceRaw(html: string, search: string, value: string): string {
  return html.split(search).join(value);
}

function removeFirstElementByClass(html: string, className: string): string {
  const startRegex = new RegExp(`<div\\s+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`);
  const match = startRegex.exec(html);

  if (!match) return html;

  let depth = 0;
  const tagRegex = /<\/?div\b[^>]*>/gi;
  tagRegex.lastIndex = match.index;

  for (let tagMatch = tagRegex.exec(html); tagMatch; tagMatch = tagRegex.exec(html)) {
    const tag = tagMatch[0];
    depth += tag.startsWith("</") ? -1 : 1;

    if (depth === 0) {
      return `${html.slice(0, match.index)}${html.slice(tagRegex.lastIndex)}`;
    }
  }

  return html;
}

function removeSectionBetweenMarkers(
  html: string,
  startMarker: string,
  endMarker: string,
): string {
  const start = html.indexOf(startMarker);
  if (start === -1) return html;

  const end = html.indexOf(endMarker, start + startMarker.length);
  if (end === -1) return html;

  return `${html.slice(0, start)}${html.slice(end)}`;
}

function replaceOrbContent(
  html: string,
  variant: "a" | "b",
  value: string,
  unit: string,
): string {
  const priceClass = variant === "b" ? " price-b" : "";

  return html.replace(
    new RegExp(
      `(<div class="orb-wrapper orb-destination-small">[\\s\\S]*?<div class="orb-content">)[\\s\\S]*?(</div>\\s*</div>\\s*<div class="orb-footer-label footer-label-${variant}">)`,
    ),
    `$1
                                                <div class="display orb-price-sm${priceClass}">${escapeHtml(value)}</div>
                                                <div class="mono orb-unit-sm">${escapeHtml(unit)}</div>
                                            $2`,
  );
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
  const formatted = new Intl.NumberFormat(LOCALES[language], {
    maximumFractionDigits,
    minimumFractionDigits,
  }).format(value);

  const [integerPart, decimalPart] = formatted.split(",");
  const shouldForceGrouping =
    Math.abs(value) >= 1000 && !integerPart.includes(".") && !integerPart.includes(" ");

  if (!shouldForceGrouping) return formatted;

  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimalPart ? `${groupedInteger},${decimalPart}` : groupedInteger;
}

function formatCurrency(
  value: number,
  language: AppLanguage,
  maximumFractionDigits = 2,
): string {
  return `${formatNumber(value, language, maximumFractionDigits)} €`;
}

function formatEnergyPrice(value: number, language: AppLanguage): string {
  return formatNumber(value, language, 3, 3);
}

function getSavingsNoteLabels(language: AppLanguage): {
  annual: string;
  monthly: string;
  total25Years: string;
} {
  if (language === "gl") {
    return {
      annual: "Aforro anual",
      monthly: "Aforro mensual",
      total25Years: "Aforro a 25 anos",
    };
  }

  if (language === "ca" || language === "val") {
    return {
      annual: "Estalvi anual",
      monthly: "Estalvi mensual",
      total25Years: "Estalvi a 25 anys",
    };
  }

  return {
    annual: "Ahorro anual",
    monthly: "Ahorro mensual",
    total25Years: "Ahorro a 25 años",
  };
}

function getProjectionFootnote(language: AppLanguage): string {
  if (language === "gl") return "* Proxección estimada cun IPC do 2% anual.";
  if (language === "ca" || language === "val") return "* Projecció estimada amb un IPC del 2% anual.";
  return "* Proyección estimada un IPC del 2% anual.";
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

function fullName(
  billData: BillData,
  fallback: string,
): string {
  return [billData.name, billData.lastName].filter(Boolean).join(" ").trim() || fallback;
}

function locationFromAddress(address: string | undefined, fallback: string): string {
  if (!address) return fallback;

  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) return parts.slice(-2).join(" · ");
  return parts[0] || fallback;
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

function discountFromPrice(currentPrice: number, proposedPrice: number): number {
  return currentPrice > 0 ? clampPercent(Math.round((1 - proposedPrice / currentPrice) * 100)) : 0;
}

function formatSvgNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2).replace(/\.?0+$/, "") : "0";
}

function clampSvgLabelY(value: number): number {
  return Math.min(Math.max(value, 28), 170);
}

function buildStablePricePath(points: number[], minValue: number, maxValue: number): string {
  const width = 400;
  const top = 18;
  const bottom = 182;
  const height = bottom - top;
  const range = maxValue > minValue ? maxValue - minValue : 1;

  return points
    .map((value, index) => {
      const x = (width / (points.length - 1)) * index;
      const y = bottom - ((Math.max(value, minValue) - minValue) / range) * height;
      return `${index === 0 ? "M" : "L"}${formatSvgNumber(x)},${formatSvgNumber(y)}`;
    })
    .join(" ");
}

function buildStabilityOrbitHtml(params: {
  currentPrice: number;
  currentAnnualCost: number;
  currentComparableAnnualCost: number;
  investment?: ProposalPdfSummary;
  investmentEnergyPrice: number;
  investmentFixedAmount?: number;
  investmentTotalCost25Years: number;
  investmentUsesFixedDisplay?: boolean;
  language: AppLanguage;
  service?: ProposalPdfSummary;
  serviceEnergyPrice: number;
  serviceFixedAmount?: number;
  serviceTotalCost25Years: number;
  serviceUsesFixedDisplay?: boolean;
  texts: ReturnType<typeof getProposalPdfTexts>;
}): string {
  const labels = getSavingsNoteLabels(params.language);
  const modeSummary = (
    proposal: ProposalPdfSummary | undefined,
    label: string,
    color: string,
    total25Years: number,
    className: string,
  ) => {
    if (!proposal) return "";

    const annualSavings = positive(proposal.annualSavings);
    const monthlySavings = annualSavings / 12;

    return `<div class="stability-orbit-note orbit-mode-note ${className}" style="border-color:${color};">
        <div class="orbit-kicker" style="color:${color};">${escapeHtml(label)}</div>
        <div class="orbit-row"><span>${labels.annual}</span><strong style="color:${color};">${formatCurrency(annualSavings, params.language)}</strong></div>
        <div class="orbit-row"><span>${labels.monthly}</span><strong style="color:${color};">${formatCurrency(monthlySavings, params.language)}</strong></div>
        <div class="orbit-row"><span>${labels.total25Years}</span><strong style="color:${color};">${formatCurrency(total25Years, params.language)}</strong></div>
      </div>`;
  };

  return `<div class="stability-orbit-notes">
      ${modeSummary(params.service, params.texts.serviceLegend, "#7AB1FF", params.serviceTotalCost25Years, "orbit-note-service")}
      ${modeSummary(params.investment, params.texts.investmentLegend, "#2ED1BC", params.investmentTotalCost25Years, "orbit-note-investment")}
    </div>`;
}

function buildStabilityGraphHtml(params: {
  currentPrice: number;
  currentComparableAnnualCost: number;
  investment?: ProposalPdfSummary;
  investmentEnergyPrice: number;
  investmentFixedAmount?: number;
  investmentTotalCost25Years: number;
  investmentUsesFixedDisplay?: boolean;
  language: AppLanguage;
  service?: ProposalPdfSummary;
  serviceEnergyPrice: number;
  serviceFixedAmount?: number;
  serviceTotalCost25Years: number;
  serviceUsesFixedDisplay?: boolean;
  texts: ReturnType<typeof getProposalPdfTexts>;
}): string {
  const years = Array.from({ length: PROJECTION_YEARS + 1 }, (_, index) => index);
  const currentLine = years.map((year) => params.currentPrice * Math.pow(1 + PROJECTION_IPC_RATE, year));
  const serviceLine = years.map(() => params.serviceEnergyPrice);
  const investmentLine = years.map(() => params.investmentEnergyPrice);
  const activeValues = [
    ...currentLine,
    ...(params.service && !params.serviceUsesFixedDisplay ? serviceLine : []),
    ...(params.investment && !params.investmentUsesFixedDisplay ? investmentLine : []),
  ].filter((value) => value > 0);
  const current25Price = currentLine[currentLine.length - 1] ?? params.currentPrice;
  const minValue = Math.max(Math.min(...activeValues) * 0.72, 0);
  const maxValue = Math.max(...activeValues, current25Price) * 1.08;
  const currentPath = buildStablePricePath(currentLine, minValue, maxValue);
  const servicePath = buildStablePricePath(serviceLine, minValue, maxValue);
  const investmentPath = buildStablePricePath(investmentLine, minValue, maxValue);

  const lineY = (value: number) => {
    const top = 18;
    const bottom = 182;
    const height = bottom - top;
    const range = maxValue > minValue ? maxValue - minValue : 1;
    return bottom - ((Math.max(value, minValue) - minValue) / range) * height;
  };

  const serviceStartY = lineY(params.serviceEnergyPrice);
  const investmentStartY = lineY(params.investmentEnergyPrice);
  let serviceLabelY = clampSvgLabelY(serviceStartY);
  let investmentLabelY = clampSvgLabelY(investmentStartY);

  if (params.service && params.investment && Math.abs(serviceLabelY - investmentLabelY) < 18) {
    const midpoint = (serviceLabelY + investmentLabelY) / 2;
    serviceLabelY = clampSvgLabelY(midpoint - 9);
    investmentLabelY = clampSvgLabelY(midpoint + 9);
  }
  const serviceEndLabel = params.serviceUsesFixedDisplay
    ? `${formatCurrency(params.serviceFixedAmount ?? 0, params.language)} ${params.texts.monthSuffix.trim()}`
    : `${formatEnergyPrice(params.serviceEnergyPrice, params.language)} €/kWh`;
  const investmentEndLabel = params.investmentUsesFixedDisplay
    ? formatCurrency(params.investmentFixedAmount ?? 0, params.language)
    : `${formatEnergyPrice(params.investmentEnergyPrice, params.language)} €/kWh`;
  const graphPill = (
    text: string,
    x: number,
    y: number,
    width: number,
    color: string,
    anchor: "start" | "end" = "start",
  ) => {
    const textX = anchor === "end" ? x + width - 6 : x + 6;
    return `<rect x="${formatSvgNumber(x)}" y="${formatSvgNumber(y - 8)}" width="${formatSvgNumber(width)}" height="16" rx="8" fill="#FFFFFF" stroke="${color}" stroke-width="0.8" stroke-opacity="0.38"></rect>
                          <text x="${formatSvgNumber(textX)}" y="${formatSvgNumber(y + 2.8)}" font-size="7.8" fill="${color}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-weight="800">${escapeHtml(text)}</text>`;
  };

  return `<div class="proposal-stability-graph" style="margin:0 0 28px;">
                  <div class="eyebrow graph-section-eyebrow">${params.texts.stabilityTitle}</div>
                  <div class="graph-block condensed-graph p2-graph-block" style="padding:22px 28px;background:#fff;border:1px solid #E4EAF7;border-radius:10px;box-shadow:none;">
                    <div style="max-width:720px;margin:0 auto;">
                        <svg viewBox="0 0 400 214" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block;overflow:visible;">
                          <defs>
                            <linearGradient id="proposalGraphFade" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stop-color="#2ED1BC" stop-opacity="0.18"></stop>
                              <stop offset="100%" stop-color="#2ED1BC" stop-opacity="0"></stop>
                            </linearGradient>
                          </defs>
                          <rect x="0" y="0" width="400" height="200" rx="10" fill="#FFFFFF"></rect>
                          <line x1="0" x2="400" y1="34" y2="34" stroke="#E8ECF8" stroke-width="1"></line>
                          <line x1="0" x2="400" y1="78" y2="78" stroke="#E8ECF8" stroke-width="1"></line>
                          <line x1="0" x2="400" y1="122" y2="122" stroke="#E8ECF8" stroke-width="1"></line>
                          <line x1="0" x2="400" y1="174" y2="174" stroke="#BDEFE8" stroke-width="2.2"></line>
                          <path d="${currentPath}" stroke="#706F6F" stroke-width="4.8" fill="none" stroke-linejoin="round" stroke-linecap="round"></path>
                          ${params.service && !params.serviceUsesFixedDisplay ? `<path d="${servicePath}" stroke="#7AB1FF" stroke-width="3.8" fill="none" stroke-linecap="round"></path>` : ""}
                          ${params.investment && !params.investmentUsesFixedDisplay ? `<path d="${investmentPath}" stroke="#2ED1BC" stroke-width="3.8" fill="none" stroke-linecap="round"></path>` : ""}
                          <circle cx="400" cy="34" r="4.5" fill="#706F6F" stroke="#fff" stroke-width="1.5"></circle>
                          ${graphPill(`${formatEnergyPrice(current25Price, params.language)} €/kWh`, 306, 24, 90, "#706F6F", "end")}
                          ${params.service ? `${graphPill(params.texts.serviceLegend, 4, serviceLabelY, 86, "#7AB1FF")}
                          ${graphPill(serviceEndLabel, 306, serviceLabelY, 90, "#7AB1FF", "end")}` : ""}
                          ${params.investment ? `${graphPill(params.texts.investmentLegend, 4, investmentLabelY, 96, "#2ED1BC")}
                          ${graphPill(investmentEndLabel, 306, investmentLabelY, 90, "#2ED1BC", "end")}` : ""}
                          <text x="4" y="198" font-size="10" fill="#7A81A8" font-family="monospace" font-weight="bold">${params.texts.year1}</text>
                          <text x="396" y="198" font-size="10" fill="#7A81A8" text-anchor="end" font-family="monospace" font-weight="bold">${params.texts.year25}</text>
                        </svg>
                        <div style="font-size:8.5px;color:#7A81A8;margin-top:8px;">${getProjectionFootnote(params.language)}</div>
                    </div>
                  </div>
                </div>`;
}

function buildTemplateValues(payload: ProposalPdfPayload, language: AppLanguage): TemplateValues {
  const { billData, calculationResult: result, proposals } = payload;
  const texts = getProposalPdfTexts(language);
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

  const annualSelfConsumedEnergyKwh = positive(
    result.annualSelfConsumedEnergyKwh,
    annualConsumptionKwh,
  );
  const currentComparableAnnualCost = Math.min(
    currentAnnualCost,
    positive(result.annualSelfConsumptionValue, annualSelfConsumedEnergyKwh * currentPrice),
  );
  const calculatedAnnualServiceFee = positive(result.annualServiceFee);
  const monthlyFee = calculatedAnnualServiceFee > 0
    ? calculatedAnnualServiceFee / 12
    : positive(service?.monthlyFee);
  const upfrontCost = positive(investment?.upfrontCost, positive(result.investmentCost));
  const annualServiceFee = positive(calculatedAnnualServiceFee, monthlyFee * 12);
  const serviceTotalCost25Years = annualServiceFee * PROJECTION_YEARS;
  const investmentTotalCost25Years = upfrontCost;
  const serviceEnergyPrice = positive(
    service?.energyPriceKwh,
    annualSelfConsumedEnergyKwh > 0 ? annualServiceFee / annualSelfConsumedEnergyKwh : 0,
  );
  const serviceUsesFixedDisplay = Boolean(
    service && service.energyPriceKwh === null && monthlyFee > 0,
  );
  const investmentEnergyPrice = positive(
    investment?.energyPriceKwh,
    annualSelfConsumedEnergyKwh > 0
      ? investmentTotalCost25Years / (annualSelfConsumedEnergyKwh * PROJECTION_YEARS)
      : 0,
  );
  const investmentUsesFixedDisplay = Boolean(
    investment && investment.energyPriceKwh === null && upfrontCost > 0,
  );
  const recommendedMode =
    service && investment
      ? serviceAnnualSavings >= investmentAnnualSavings
        ? "service"
        : "investment"
      : service
        ? "service"
        : investment
          ? "investment"
          : null;

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

  const investmentPaybackYears = positive(
    investment?.paybackYears,
    positive(result.paybackYears),
  );
  const contact = [preferred?.companyPhone, preferred?.companyEmail].filter(Boolean).join(" · ");
  const companyName = preferred?.companyName?.trim() || "Solar Común";
  const companyEmail = preferred?.companyEmail?.trim() || "hola@solarcomun.coop";
  const reserveHref = payload.continueContractUrl?.trim() || `mailto:${companyEmail}`;
  const paybackText = investmentPaybackYears
    ? `${formatNumber(investmentPaybackYears, language, 1, 1)} ${texts.yearsLabel}`
    : "-";

  return {
    clientName: fullName(billData, texts.clientFallback),
    clientMeta: `${locationFromAddress(billData.address, texts.pendingLocation)} · ${formatMonthYear(language)}`,
    annualConsumption: `${formatKwh(annualConsumptionKwh, language)}${texts.annualSuffix}`,
    tariff: `${billData.billType.replace("TD", ".0TD")} · ${contractedPower(billData, language)}`,
    currentAnnualCost: `${formatCurrency(currentAnnualCost, language)}${texts.annualSuffix}`,
    plantName: preferred?.installationName || preferred?.installationAddress || texts.assignedPlant,
    currentEnergyPrice: formatEnergyPrice(currentPrice, language),
    currentBaseEnergyPrice: `${formatEnergyPrice(positive(result.weightedEnergyPriceKwh, currentPrice), language)} ${texts.plusTaxes}`,
    bestDiscountText: fillTranslationTemplate(texts.upToCheaperTemplate, {
      value: `${bestDiscount}%`,
    }),
    serviceDiscount: `−${serviceDiscount}%`,
    investmentDiscount: `−${investmentDiscount}%`,
    serviceEnergyPrice: formatEnergyPrice(serviceEnergyPrice, language),
    investmentEnergyPrice: formatEnergyPrice(investmentEnergyPrice, language),
    serviceAnnualCost: `${formatCurrency(annualServiceFee, language)}${texts.annualSuffix}`,
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
    investmentPayback: paybackText,
    recommendedPower: formatNumber(recommendedPowerKwp, language, 1, 1),
    panelCount: `${formatNumber(Math.max(Math.ceil(recommendedPowerKwp / 0.45), 1), language, 0)} ${texts.unitsLabel}`,
    annualProduction: formatKwh(annualProductionKwh, language),
    energy25Years: `${formatNumber(energy25Mwh, language, 0)} MWh`,
    co2Avoided: `${formatNumber(co2Tons, language, 1, 1)} t`,
    treesEquivalent: formatNumber(trees, language, 0),
    dieselKmAvoided: `${formatNumber(dieselKm, language, 0)} km`,
    investmentCardDescription: fillTranslationTemplate(
      texts.investmentCardDescriptionTemplate,
      {
        payback: paybackText,
        savings: formatCurrency(
      positive(investment?.totalSavings25Years, positive(result.totalSavings25YearsInvestment)),
      language,
        ),
      },
    ),
    contact: contact || texts.pendingContact,
    companyName,
    companyEmail,
    reserveHref,
    stabilityChartHtml: buildStabilityOrbitHtml({
      currentAnnualCost,
      currentComparableAnnualCost,
      currentPrice,
      investment,
      investmentEnergyPrice,
      investmentFixedAmount: upfrontCost,
      investmentTotalCost25Years,
      investmentUsesFixedDisplay,
      language,
      service,
      serviceEnergyPrice,
      serviceFixedAmount: monthlyFee,
      serviceTotalCost25Years,
      serviceUsesFixedDisplay,
      texts,
    }),
    stabilityGraphHtml: buildStabilityGraphHtml({
      currentComparableAnnualCost,
      currentPrice,
      investment,
      investmentEnergyPrice,
      investmentFixedAmount: upfrontCost,
      investmentTotalCost25Years,
      investmentUsesFixedDisplay,
      language,
      service,
      serviceEnergyPrice,
      serviceFixedAmount: monthlyFee,
      serviceTotalCost25Years,
      serviceUsesFixedDisplay,
      texts,
    }),
    recommendedMode,
  };
}

export function buildProposalPdfHtml(payload: ProposalPdfPayload): string {
  const language = normalizeLanguage(payload.language);
  const values = buildTemplateValues(payload, language);
  const texts = getProposalPdfTexts(language);
  const service = findProposal(payload.proposals, "service");
  const investment = findProposal(payload.proposals, "investment");
  const hasService = payload.proposals.some((proposal) => proposal.mode === "service");
  const hasInvestment = payload.proposals.some(
    (proposal) => proposal.mode === "investment",
  );
  const serviceUsesFixedDisplay = Boolean(
    service && service.energyPriceKwh === null && positive(service.monthlyFee) > 0,
  );
  const investmentUsesFixedDisplay = Boolean(
    investment && investment.energyPriceKwh === null && positive(investment.upfrontCost) > 0,
  );

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
    [
      "22 €/mes · sin entrada",
      `${values.serviceMonthlyFee}${texts.monthSuffix} · ${texts.noEntry}`,
    ],
    ["22€/mes", `${values.serviceMonthlyFee}${texts.monthSuffix}`],
    ["22 €", values.serviceMonthlyFee],
    ["0,053", values.investmentEnergyPrice],
    ["222 €/año", values.investmentUpfrontCost],
    [
      "4.593€ pago único",
      `${values.investmentUpfrontCost} ${texts.investmentCardTitle.toLowerCase()}`,
    ],
    [
      "4.593 € · pago único",
      `${values.investmentUpfrontCost} · ${texts.investmentCardTitle.toLowerCase()}`,
    ],
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
    ["Informe · Solar Común", `${texts.reportPrefix} · ${values.companyName}`],
    ["hola@solarcomun.coop", values.companyEmail],
    [
      "Máxima rentabilidad. Retorno en 7,7 años. Ahorro acumulado 25 años: 21.658 €.",
      values.investmentCardDescription,
    ],
    [
      "Máxima rentabilidad. Retorno en 7,7 años. Ahorro acumulado: 21.658 €.",
      values.investmentCardDescription,
    ],
    ["900 123 456 · hola@solarcomun.coop", values.contact],
  ];

  let html = replacements.reduce(
    (html, [search, value]) => replaceText(html, search, value),
    TEMPLATE_HTML,
  );

  html = replaceRaw(
    html,
    `<title>Propuesta Solar Común</title>`,
    `<title>Propuesta ${escapeHtml(values.companyName)}</title>`,
  );
  html = replaceRaw(
    html,
    `<span>Solar <em style="font-family: Cabin, sans-serif; font-style: italic; font-weight: 400;">Común</em></span>`,
    `<span>${escapeHtml(values.companyName)}</span>`,
  );
  html = replaceText(html, "Propuesta · Participación", texts.coverEyebrow);
  html = replaceRaw(
    html,
    `<h1 class="display main-title">La energía, <em>en tus manos</em> sin tocar tu tejado.</h1>`,
    `<h1 class="display main-title">${texts.coverTitleHtml}</h1>`,
  );
  html = replaceText(
    html,
    "Participa en la planta solar comunitaria de tu zona. Sin obras, sin cambio de compañía, y con un ahorro real en tu factura.",
    texts.coverDescription,
  );
  html = replaceText(html, "Hoy · Sin participación", texts.todayWithoutParticipation);
  html = replaceText(html, "Tu factura actual", texts.currentBillLabel);
  html = replaceText(
    html,
    "Sin inversión inicial. Ahorro neto desde el primer mes. Cancela cuando quieras.",
    texts.serviceCardDescription,
  );
  html = replaceText(
    html,
    "Tu participación en la planta",
    texts.participationFooterTitle,
  );
  html = replaceText(html, "Paneles", texts.panelsLabel);
  html = replaceText(html, "Producción anual", texts.annualProductionLabel);
  html = replaceText(html, "Distancia planta", texts.plantDistanceLabel);
  html = replaceText(
    html,
    "Formas de participar · Siguiente paso",
    texts.formsAndNextStep,
  );
  html = replaceText(html, "Ahorro / año", texts.annualSavingsLabel);
  html = replaceText(html, "Retorno", texts.returnLabel);
  html = replaceText(
    html,
    "Precio energía con participación · 25 años",
    texts.participationPriceTitle,
  );
  html = replaceText(
    html,
    "Tu impacto ambiental · 25 años",
    texts.impactTitle,
  );
  html = replaceText(html, "CO₂ evitado", texts.co2Label);
  html = replaceText(html, "Árboles", texts.treesLabel);
  html = replaceText(html, "Energía limpia", texts.cleanEnergyLabel);
  html = replaceText(html, "Diésel evitado", texts.dieselAvoidedLabel);
  html = replaceText(html, "Siguiente paso", texts.ctaEyebrow);
  html = replaceRaw(
    html,
    `<div class="display cta-title">¿Reservamos tu <em class="highlight-text-cta">participación</em>?</div>`,
    `<div class="display cta-title">${texts.ctaTitle}</div>`,
  );
  html = replaceText(html, "una vez", texts.oneTimeUnit);
  html = replaceText(html, "/ mes", texts.monthSuffix);
  html = replaceText(html, "€ / kWh", texts.perKwh);
  html = replaceText(html, "< 5 km", texts.distanceValue);

  html = replaceRaw(
    html,
    `<div class="cta-button">Reservar →</div>`,
    `<a class="cta-button" href="${escapeHtml(values.reserveHref)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;text-decoration:none;">Reservar →</a>`,
  );

  html = removeSectionBetweenMarkers(
    html,
    "<!-- Escenario solo participación",
    "<!-- Impacto ambiental con iconos -->",
  );
  html = html.replace(
    "<!-- Impacto ambiental con iconos -->",
    `${values.stabilityGraphHtml}

                <!-- Impacto ambiental con iconos -->`,
  );
  html = html.replace(
    `<div class="orbs-comparison-grid">`,
    `<div class="orbs-comparison-grid">
                            ${values.stabilityChartHtml}`,
  );
  html = removeFirstElementByClass(html, "savings-summary-block");

  html = html.replace(
    /<div class="card-description">Máxima rentabilidad\.[\s\S]*?<\/div>/,
    `<div class="card-description">${escapeHtml(values.investmentCardDescription)}</div>`,
  );

  if (!(hasService && hasInvestment)) {
    html = replaceText(
      html,
      "Dos formas de participar",
      "Modalidad disponible",
    );
    html = replaceText(html, "Elige tu opción", "Tu contratación");
    html = replaceRaw(
      html,
      `<div class="modalities-grid">`,
      `<div class="modalities-grid" style="grid-template-columns: 1fr;">`,
    );

    if (!hasService) {
      html = removeSectionBetweenMarkers(html, "<!-- A -->", "<!-- B -->");
      html = removeFirstElementByClass(html, "card-a");
      html = html.replace(
        `<div class="modality-card card-b recommended-card">
                            <div class="recommended-badge">RECOMENDADO</div>`,
        `<div class="modality-card card-b">`,
      );
    }

    if (!hasInvestment) {
      html = removeSectionBetweenMarkers(
        html,
        "<!-- B -->",
        "<!-- Resumen Ahorro Grande",
      );
      html = removeFirstElementByClass(html, "card-b");
    }

    html = html
      .replaceAll(`<div class="recommended-badge">RECOMENDADO</div>`, "")
      .replaceAll(`<div class="recommended-tag">★ RECOM.</div>`, "")
      .replaceAll(" recommended-card", "");
  }

  if (hasService && hasInvestment) {
    if (values.recommendedMode === "service") {
      html = html
        .replace(
          `<div class="orb-col destination-orb-col rec-orb-col">
                                        <div class="recommended-tag">★ RECOM.</div>
                                        <div class="eyebrow orb-label label-a">Con Cuota mensual</div>`,
          `<div class="orb-col destination-orb-col rec-orb-col">
                                        <div class="recommended-tag">★ RECOM.</div>
                                        <div class="eyebrow orb-label label-a">Con Cuota mensual</div>`,
        )
        .replace(
          `<div class="orb-col destination-orb-col">
                                        <div class="eyebrow orb-label label-a">Con Cuota mensual</div>`,
          `<div class="orb-col destination-orb-col rec-orb-col">
                                        <div class="recommended-tag">★ RECOM.</div>
                                        <div class="eyebrow orb-label label-a">Con Cuota mensual</div>`,
        )
        .replace(
          `<div class="orb-col destination-orb-col rec-orb-col">
                                        <div class="recommended-tag">★ RECOM.</div>
                                        <div class="eyebrow orb-label label-b">Con Compra única</div>`,
          `<div class="orb-col destination-orb-col">
                                        <div class="eyebrow orb-label label-b">Con Compra única</div>`,
        )
        .replace(
          `<div class="modality-card card-b recommended-card">
                            <div class="recommended-badge">RECOMENDADO</div>`,
          `<div class="modality-card card-b">`,
        )
        .replace(
          `<div class="modality-card card-a">`,
          `<div class="modality-card card-a recommended-card">
                            <div class="recommended-badge">RECOMENDADO</div>`,
        );
    } else if (values.recommendedMode !== "investment") {
      html = html
        .replace(`<div class="recommended-tag">★ RECOM.</div>`, "")
        .replace(
          `<div class="modality-card card-b recommended-card">
                            <div class="recommended-badge">RECOMENDADO</div>`,
          `<div class="modality-card card-b">`,
        );
    }

    if (values.recommendedMode !== "service") {
      html = html.replace(
        `<div class="orb-col destination-orb-col rec-orb-col">
                                        <div class="recommended-tag">★ RECOM.</div>
                                        <div class="eyebrow orb-label label-a">Con Cuota mensual</div>`,
        `<div class="orb-col destination-orb-col">
                                        <div class="eyebrow orb-label label-a">Con Cuota mensual</div>`,
      );
    }

    if (values.recommendedMode !== "investment") {
      html = html.replace(
        `<div class="orb-col destination-orb-col rec-orb-col">
                                        <div class="recommended-tag">★ RECOM.</div>
                                        <div class="eyebrow orb-label label-b">Con Compra única</div>`,
        `<div class="orb-col destination-orb-col">
                                        <div class="eyebrow orb-label label-b">Con Compra única</div>`,
      );
    }

    if (values.recommendedMode === "investment") {
      html = html.replace(
        `<div class="modality-card card-a recommended-card">
                            <div class="recommended-badge">RECOMENDADO</div>`,
        `<div class="modality-card card-a">`,
      );
    }
  }

  const localizedReplacements: Array<[string, string]> = [
    ["Dos formas de participar", texts.participationOptions],
    ["Modalidad disponible", texts.availableMode],
    ["Tu contratación", texts.yourContracting],
    ["Con Cuota mensual", texts.serviceOrbLabel],
    ["Con Compra única", texts.investmentOrbLabel],
    ["A · Cuota", texts.serviceCardLabel],
    ["B · Compra", texts.investmentCardLabel],
    ["Cuota mensual", texts.serviceCardTitle],
    ["Compra única", texts.investmentCardTitle],
    ["RECOMENDADO", texts.recommendedBadge],
    ["★ RECOM.", texts.recommendedTag],
    ["Reservar →", texts.reserveCta],
  ];

  html = localizedReplacements.reduce(
    (localizedHtml, [search, value]) => replaceText(localizedHtml, search, value),
    html,
  );

  html = html.replace(
    /(<div class="orb-footer-label footer-label-a">\s*<strong>[\s\S]*?<\/strong><br>)[^<]*(<\/div>)/,
    `$1${escapeHtml(values.serviceMonthlyFee)}${escapeHtml(texts.monthSuffix)}$2`,
  );

  html = replaceRaw(
    html,
    `<div class="display card-letter letter-a">A</div>`,
    `<div class="display card-letter letter-a" style="font-size: 20px;">${escapeHtml(texts.serviceCardLabel)}</div>`,
  );

  html = replaceRaw(
    html,
    `<div class="display card-letter letter-b">B</div>`,
    `<div class="display card-letter letter-b" style="font-size: 20px;">${escapeHtml(texts.investmentCardLabel)}</div>`,
  );

  html = replaceRaw(
    html,
    `<div class="display card-title">Compra</div>`,
    `<div class="display card-title">${escapeHtml(texts.investmentCardTitle)}</div>`,
  );

  if (serviceUsesFixedDisplay) {
    html = replaceOrbContent(
      html,
      "a",
      values.serviceMonthlyFee,
      texts.serviceCardTitle.toLowerCase(),
    );
  }

  if (investmentUsesFixedDisplay) {
    html = replaceOrbContent(
      html,
      "b",
      values.investmentUpfrontCost,
      texts.investmentCardTitle.toLowerCase(),
    );
  }

  html = removeFirstElementByClass(html, "modalities-section");

  return html;
}
