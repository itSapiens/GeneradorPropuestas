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

function removeMarkedDivBlock(html: string, marker: string, className: string): string {
  const markerStart = html.indexOf(marker);
  if (markerStart === -1) return html;

  const blockStartRegex = new RegExp(`<div\\s+class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`);
  const afterMarker = html.slice(markerStart + marker.length);
  const blockMatch = blockStartRegex.exec(afterMarker);
  if (!blockMatch) return html.replace(marker, "");

  const blockStart = markerStart + marker.length + blockMatch.index;
  let depth = 0;
  const tagRegex = /<\/?div\b[^>]*>/gi;
  tagRegex.lastIndex = blockStart;

  for (let tagMatch = tagRegex.exec(html); tagMatch; tagMatch = tagRegex.exec(html)) {
    const tag = tagMatch[0];
    depth += tag.startsWith("</") ? -1 : 1;

    if (depth === 0) {
      return `${html.slice(0, markerStart)}${html.slice(tagRegex.lastIndex)}`;
    }
  }

  return html;
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

function buildChartPath(
  points: number[],
  chart: { left: number; right: number; top: number; bottom: number },
  minValue: number,
  maxValue: number,
): string {
  const width = chart.right - chart.left;
  const height = chart.bottom - chart.top;
  const range = maxValue > minValue ? maxValue - minValue : 1;

  return points
    .map((value, index) => {
      const x = chart.left + (width / (points.length - 1)) * index;
      const y = chart.bottom - ((Math.max(value, minValue) - minValue) / range) * height;
      return `${index === 0 ? "M" : "L"}${formatSvgNumber(x)},${formatSvgNumber(y)}`;
    })
    .join(" ");
}

function chartPointY(
  value: number,
  chart: { top: number; bottom: number },
  minValue: number,
  maxValue: number,
): number {
  const height = chart.bottom - chart.top;
  const range = maxValue > minValue ? maxValue - minValue : 1;
  return chart.bottom - ((Math.max(value, minValue) - minValue) / range) * height;
}

function buildChartAreaPath(
  upperPoints: number[],
  lowerPoints: number[],
  chart: { left: number; right: number; top: number; bottom: number },
  minValue: number,
  maxValue: number,
): string {
  const width = chart.right - chart.left;
  const range = maxValue > minValue ? maxValue - minValue : 1;
  const topPath = upperPoints.map((value, index) => {
    const x = chart.left + (width / (upperPoints.length - 1)) * index;
    const y = chart.bottom - ((Math.max(value, minValue) - minValue) / range) * (chart.bottom - chart.top);
    return `${index === 0 ? "M" : "L"}${formatSvgNumber(x)},${formatSvgNumber(y)}`;
  });
  const bottomPath = lowerPoints
    .map((value, index) => {
      const x = chart.left + (width / (lowerPoints.length - 1)) * index;
      const y = chart.bottom - ((Math.max(value, minValue) - minValue) / range) * (chart.bottom - chart.top);
      return `L${formatSvgNumber(x)},${formatSvgNumber(y)}`;
    })
    .reverse();

  return `${topPath.join(" ")} ${bottomPath.join(" ")} Z`;
}

function buildAreaToBaselinePath(
  points: number[],
  chart: { left: number; right: number; top: number; bottom: number },
  minValue: number,
  maxValue: number,
): string {
  return `${buildChartPath(points, chart, minValue, maxValue)} L${chart.right},${chart.bottom} L${chart.left},${chart.bottom} Z`;
}

function niceChartStep(rawStep: number): number {
  const steps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1];
  return steps.find((step) => step >= rawStep) ?? 0.1;
}

function getChartScale(values: number[]): { min: number; max: number; ticks: number[] } {
  const finiteValues = values.filter((value) => Number.isFinite(value) && value > 0);
  const rawMin = Math.min(...finiteValues);
  const rawMax = Math.max(...finiteValues);
  const boundsStep = rawMax < 0.5 ? 0.01 : niceChartStep((rawMax - rawMin || rawMax) / 8);
  const min = Math.max(0, Math.floor((rawMin * 0.92) / boundsStep) * boundsStep);
  const max = Math.ceil((rawMax * 1.06) / boundsStep) * boundsStep;
  const step = niceChartStep((max - min || rawMax * 0.2 || 0.01) / 5);
  const tickCount = Math.max(Math.round((max - min) / step), 1);
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => min + step * index);

  return { min, max, ticks };
}

function distributeChartLabels(
  labels: Array<{ key: string; y: number }>,
  minY: number,
  maxY: number,
  gap = 24,
): Record<string, number> {
  const sorted = [...labels].sort((a, b) => a.y - b.y);

  for (let index = 0; index < sorted.length; index += 1) {
    sorted[index].y = Math.max(sorted[index].y, index === 0 ? minY : sorted[index - 1].y + gap);
  }

  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    sorted[index].y = Math.min(
      sorted[index].y,
      index === sorted.length - 1 ? maxY : sorted[index + 1].y - gap,
    );
  }

  return sorted.reduce<Record<string, number>>((acc, label) => {
    acc[label.key] = label.y;
    return acc;
  }, {});
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
  const years = Array.from({ length: PROJECTION_YEARS + 1 }, (_, i) => i);
  const currentLine = years.map((y) => params.currentPrice * Math.pow(1 + PROJECTION_IPC_RATE, y));
  const chart = { left: 58, right: 690, top: 30, bottom: 178 };

  const series = [
    {
      color: "#5E6472",
      gradientId: "currentPriceGradient",
      key: "current",
      label: params.texts.currentBillLegend,
      points: currentLine,
      stopColor: "#5E6472",
    },
    params.service && !params.serviceUsesFixedDisplay
      ? {
          color: "#4F9BFF",
          gradientId: "servicePriceGradient",
          key: "service",
          label: params.texts.serviceLegend,
          points: years.map(() => params.serviceEnergyPrice),
          stopColor: "#4F9BFF",
        }
      : null,
    params.investment && !params.investmentUsesFixedDisplay
      ? {
          color: "#23C7B5",
          gradientId: "investmentPriceGradient",
          key: "investment",
          label: params.texts.investmentLegend,
          points: years.map(() => params.investmentEnergyPrice),
          stopColor: "#23C7B5",
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const allValues = series.flatMap((item) => item.points);
  const scale = getChartScale(allValues);

  const gridLines = scale.ticks
    .map((tick) => {
      const y = chartPointY(tick, chart, scale.min, scale.max);
      return `<g>
          <line x1="${chart.left}" x2="${chart.right}" y1="${formatSvgNumber(y)}" y2="${formatSvgNumber(y)}" stroke="#E8ECF5" stroke-width="1" />
          <text x="${chart.left - 12}" y="${formatSvgNumber(y + 3)}" text-anchor="end" font-size="9" fill="#8790B2" font-family="Cabin, Arial, sans-serif" font-weight="600">${formatEnergyPrice(tick, params.language)}</text>
        </g>`;
    })
    .join("");
  const yearLabels: Record<number, string> = {
    0: "Inicio",
    12: "Año 12",
    25: "Año 25",
  };
  const milestoneYears = [0, 12, 25];
  const milestoneGuides = milestoneYears
    .map((year) => {
      const x = chart.left + ((chart.right - chart.left) / PROJECTION_YEARS) * year;
      return `<g>
          <line x1="${formatSvgNumber(x)}" x2="${formatSvgNumber(x)}" y1="${chart.top}" y2="${chart.bottom}" stroke="#DCE3F1" stroke-width="1" stroke-dasharray="3 5" />
        </g>`;
    })
    .join("");
  const seriesAreas = series
    .map(
      (item) =>
        `<path d="${buildAreaToBaselinePath(item.points, chart, scale.min, scale.max)}" fill="url(#${item.gradientId})" />`,
    )
    .join("");
  const seriesLines = series
    .map(
      (item) =>
        `<path d="${buildChartPath(item.points, chart, scale.min, scale.max)}" fill="none" stroke="${item.color}" stroke-width="${item.key === "current" ? 4 : 3}" stroke-linecap="round" stroke-linejoin="round" />`,
    )
    .join("");
  const milestoneDots = series
    .flatMap((item) =>
      milestoneYears.map((year) => {
        const value = item.points[year] ?? item.points[item.points.length - 1] ?? 0;
        const x = chart.left + ((chart.right - chart.left) / PROJECTION_YEARS) * year;
        const y = chartPointY(value, chart, scale.min, scale.max);

        return `<circle cx="${formatSvgNumber(x)}" cy="${formatSvgNumber(y)}" r="3.7" fill="${item.color}" stroke="#FFFFFF" stroke-width="2" />`;
      }),
    )
    .join("");
  const milestoneLabels = series
    .flatMap((item, seriesIndex) =>
      milestoneYears.map((year) => {
        const value = item.points[year] ?? item.points[item.points.length - 1] ?? 0;
        const x = chart.left + ((chart.right - chart.left) / PROJECTION_YEARS) * year;
        const y = chartPointY(value, chart, scale.min, scale.max);
        const boxWidth = 52;
        const boxHeight = 17;
        const preferredY = item.key === "current"
          ? y + 10
          : item.key === "service"
            ? y - 26
            : y + 10;
        const boxX = Math.min(Math.max(x - boxWidth / 2, chart.left + 2), chart.right - boxWidth - 2);
        const boxY = Math.min(
          Math.max(preferredY + (seriesIndex === 0 ? 0 : seriesIndex * 2), chart.top + 2),
          chart.bottom - boxHeight - 2,
        );

        return `<g>
          <rect x="${formatSvgNumber(boxX)}" y="${formatSvgNumber(boxY)}" width="${boxWidth}" height="${boxHeight}" rx="6" fill="#FFFFFF" fill-opacity="0.94" stroke="${item.color}" stroke-opacity="0.36" />
          <text x="${formatSvgNumber(boxX + boxWidth / 2)}" y="${formatSvgNumber(boxY + 12)}" text-anchor="middle" font-size="8.5" fill="${item.color}" font-family="Cabin, Arial, sans-serif" font-weight="800">${formatEnergyPrice(value, params.language)}</text>
        </g>`;
      }),
    )
    .join("");
  const legendItems = series
    .map(
      (item) =>
        `<span style="display:inline-flex;align-items:center;gap:5px;"><i style="width:16px;height:3px;border-radius:9px;background:${item.color};display:inline-block;"></i>${escapeHtml(item.label)}</span>`,
    )
    .join("");

  return `<div class="proposal-stability-graph" style="margin:0 0 28px;">
                  <div class="eyebrow graph-section-eyebrow">${escapeHtml(params.texts.stabilityTitle)}</div>
                  <div class="graph-block condensed-graph p2-graph-block clean-stability-chart" style="padding:18px 24px 20px;background:#fff;border:1px solid #E2E8F5;border-radius:10px;box-shadow:none;overflow:hidden;">
                    <div style="max-width:720px;margin:0 auto;">
                      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:8px;">
                        <div style="font-size:10px;line-height:1.35;color:#5D668F;font-weight:600;max-width:330px;">${escapeHtml(getProjectionFootnote(params.language))}</div>
                        <div style="display:flex;gap:12px;align-items:center;color:#7A81A8;font-size:9px;font-weight:700;white-space:nowrap;">${legendItems}</div>
                      </div>
                      <svg viewBox="0 0 748 230" role="img" aria-label="${escapeHtml(params.texts.stabilityTitle)}" style="display:block;width:100%;height:230px;">
                        <defs>
                          ${series
                            .map(
                              (item) =>
                                `<linearGradient id="${item.gradientId}" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stop-color="${item.stopColor}" stop-opacity="${item.key === "current" ? "0.12" : "0.16"}" />
                                  <stop offset="100%" stop-color="${item.stopColor}" stop-opacity="0" />
                                </linearGradient>`,
                            )
                            .join("")}
                        </defs>
                        <rect x="0" y="0" width="748" height="230" rx="8" fill="#FFFFFF" />
                        ${gridLines}
                        ${milestoneGuides}
                        <line x1="${chart.left}" x2="${chart.right}" y1="${chart.bottom}" y2="${chart.bottom}" stroke="#DCE3F1" stroke-width="1" />
                        ${seriesAreas}
                        ${seriesLines}
                        ${milestoneDots}
                        ${milestoneLabels}
                        ${milestoneYears
                          .map((year) => {
                            const x = chart.left + ((chart.right - chart.left) / PROJECTION_YEARS) * year;
                            return `<text x="${formatSvgNumber(x)}" y="214" text-anchor="middle" font-size="9.5" fill="#7A81A8" font-family="Cabin, Arial, sans-serif" font-weight="800">${yearLabels[year]}</text>`;
                          })
                          .join("")}
                      </svg>
                    </div>
                  </div>
                </div>
                <script>window.chartReady = true;</script>`;
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
    [
      "22 €/mes · sin entrada",
      `${values.serviceMonthlyFee}${texts.monthSuffix} · ${texts.noEntry}`,
    ],
    ["22€/mes", `${values.serviceMonthlyFee}${texts.monthSuffix}`],
    ["22 €", values.serviceMonthlyFee],
    ["0,053", values.investmentEnergyPrice],
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
    const singleModeClass = hasService ? "single-service-grid" : "single-investment-grid";

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
    html = replaceRaw(
      html,
      `<div class="orbs-comparison-grid">`,
      `<div class="orbs-comparison-grid single-modality-grid ${singleModeClass}">`,
    );

    if (!hasService) {
      html = removeMarkedDivBlock(html, "<!-- A -->", "destination-row");
      html = removeFirstElementByClass(html, "card-a");
      html = html.replace(
        `<div class="modality-card card-b recommended-card">
                            <div class="recommended-badge">RECOMENDADO</div>`,
        `<div class="modality-card card-b">`,
      );
    }

    if (!hasInvestment) {
      html = removeMarkedDivBlock(html, "<!-- B -->", "destination-row");
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
