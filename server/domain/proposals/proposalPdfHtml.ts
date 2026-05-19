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
  companyLogoDataUri?: string | null;
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
  serviceAnnualCost: string;
  investmentUpfrontCost: string;
  investmentAnnualCost: string;
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
  companyLogoHtml: string;
  reserveHref: string;
  brandStyle: string;
  coverTitleHtml: string;
  extraConsumptionHtml: string;
  stabilityChartHtml: string;
  stabilityGraphHtml: string;
  recommendedMode: ProposalPdfSummary["mode"] | null;
};

type BrandColors = {
  accent: string;
  cardBackground: string;
  pageBackground: string;
  primary: string;
  secondary: string;
  text: string;
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

function normalizeHexColor(value: unknown, fallback: string): string {
  const color = typeof value === "string" ? value.trim() : "";
  return /^#[0-9A-F]{6}$/i.test(color) ? color : fallback;
}

function hexToRgb(color: string): { r: number; g: number; b: number } {
  const normalized = normalizeHexColor(color, "#000000").slice(1);

  return {
    b: Number.parseInt(normalized.slice(4, 6), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    r: Number.parseInt(normalized.slice(0, 2), 16),
  };
}

function colorToRgbTriplet(color: string): string {
  const rgb = hexToRgb(color);
  return `${rgb.r},${rgb.g},${rgb.b}`;
}

function rgba(color: string, alpha: number): string {
  return `rgba(${colorToRgbTriplet(color)},${alpha})`;
}

function mixHexColors(color: string, target: string, targetWeight: number): string {
  const sourceRgb = hexToRgb(color);
  const targetRgb = hexToRgb(target);
  const weight = Math.min(Math.max(targetWeight, 0), 1);
  const channel = (source: number, targetValue: number) =>
    Math.round(source * (1 - weight) + targetValue * weight)
      .toString(16)
      .padStart(2, "0");

  return `#${channel(sourceRgb.r, targetRgb.r)}${channel(sourceRgb.g, targetRgb.g)}${channel(sourceRgb.b, targetRgb.b)}`;
}

function getRelativeLuminance(color: string): number {
  const { r, g, b } = hexToRgb(color);
  const channels = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function getReadableTextColor(background: string, darkText: string): string {
  return getRelativeLuminance(background) > 0.58 ? darkText : "#FFFFFF";
}

function buildCardSurfaceColor(colors: BrandColors): string {
  const pageLuminance = getRelativeLuminance(colors.pageBackground);
  const cardLuminance = getRelativeLuminance(colors.cardBackground);

  if (cardLuminance < 0.28) {
    return mixHexColors(colors.pageBackground, "#FFFFFF", pageLuminance < 0.28 ? 0.08 : 0.02);
  }

  return mixHexColors(colors.cardBackground, "#FFFFFF", 0.02);
}

function normalizePhraseToken(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildCoverTitleHtml(params: {
  language: AppLanguage;
  proposal?: ProposalPdfSummary;
  texts: ReturnType<typeof getProposalPdfTexts>;
}): string {
  const intro = params.proposal?.companyPdfFraseInicio?.trim();
  const highlight = params.proposal?.companyPdfFraseDestacada?.trim();
  const final = params.proposal?.companyPdfFraseFinal?.trim();

  if (!intro && !highlight && !final) return params.texts.coverTitleHtml;

  const incoming = normalizePhraseToken([intro, highlight, final].filter(Boolean).join(" "));
  const knownDefaultPhrases = [
    "La energía, en tus manos sin tocar tu tejado.",
    "L'energia, a les teues mans sense tocar la teua teulada.",
    "A enerxía, nas túas mans sen tocar o teu tellado.",
  ].map(normalizePhraseToken);

  if (knownDefaultPhrases.includes(incoming)) {
    return params.texts.coverTitleHtml;
  }

  return [
    intro ? escapeHtml(intro) : "",
    highlight ? `<em>${escapeHtml(highlight)}</em>` : "",
    final ? escapeHtml(final) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function buildBrandColors(proposal?: ProposalPdfSummary): BrandColors {
  const text = normalizeHexColor(proposal?.companyPdfColorTexto, "#0B1957");

  return {
    accent: normalizeHexColor(proposal?.companyPdfColorAcento, "#2ED1BC"),
    cardBackground: normalizeHexColor(proposal?.companyPdfColorFondoCard, "#FFFFFF"),
    pageBackground: normalizeHexColor(proposal?.companyPdfColorFondoPagina, "#F8F8F5"),
    primary: normalizeHexColor(proposal?.companyPdfColorPrimario, text),
    secondary: normalizeHexColor(proposal?.companyPdfColorSecundario, "#7AB1FF"),
    text,
  };
}

function buildBrandStyle(colors: BrandColors): string {
  const textLight = mixHexColors(colors.text, "#FFFFFF", 0.34);
  const textMuted = mixHexColors(colors.text, "#FFFFFF", 0.56);
  const gradientMid = mixHexColors(colors.accent, colors.secondary, 0.5);
  const ctaText = getReadableTextColor(gradientMid, colors.text);
  const cardSurface = buildCardSurfaceColor(colors);
  const cardSurfaceAlt = mixHexColors(cardSurface, colors.primary, 0.1);
  const cardSurfaceAccent = mixHexColors(cardSurface, colors.accent, 0.08);
  const cardSurfaceText = getReadableTextColor(cardSurface, colors.text);
  const cardSurfaceMuted = cardSurfaceText === "#FFFFFF"
    ? rgba("#FFFFFF", 0.62)
    : mixHexColors(colors.text, "#FFFFFF", 0.46);
  const participationOverlayText = getReadableTextColor(colors.primary, colors.text);

  return [
    `--text-main:${colors.text}`,
    `--text-light:${textLight}`,
    `--text-muted:${textMuted}`,
    `--text-main-rgb:${colorToRgbTriplet(colors.text)}`,
    `--brand-primary:${colors.primary}`,
    `--brand-primary-rgb:${colorToRgbTriplet(colors.primary)}`,
    `--brand-blue:${colors.secondary}`,
    `--brand-blue-rgb:${colorToRgbTriplet(colors.secondary)}`,
    `--brand-mint:${colors.accent}`,
    `--brand-mint-rgb:${colorToRgbTriplet(colors.accent)}`,
    `--bg-page:${colors.pageBackground}`,
    `--bg-card:${colors.cardBackground}`,
    `--participation-card-bg:${cardSurface}`,
    `--participation-card-bg-alt:${cardSurfaceAlt}`,
    `--participation-card-bg-accent:${cardSurfaceAccent}`,
    `--participation-card-text:${cardSurfaceText}`,
    `--participation-card-muted:${cardSurfaceMuted}`,
    `--participation-red-bg:${rgba(colors.primary, 0.61)}`,
    `--participation-red-bg-soft:${rgba(colors.primary, 0.34)}`,
    `--participation-red-bg-deep:${rgba(colors.primary, 0.18)}`,
    `--participation-red-border:${rgba(colors.primary, 0.48)}`,
    `--participation-red-text:${participationOverlayText}`,
    `--participation-red-muted:${participationOverlayText === "#FFFFFF" ? rgba("#FFFFFF", 0.68) : rgba(colors.text, 0.72)}`,
    `--brand-primary-soft:${rgba(colors.primary, 0.1)}`,
    `--brand-primary-border:${rgba(colors.primary, 0.18)}`,
    `--brand-secondary-soft:${rgba(colors.secondary, 0.14)}`,
    `--brand-secondary-border:${rgba(colors.secondary, 0.3)}`,
    `--brand-accent-soft:${rgba(colors.accent, 0.14)}`,
    `--brand-accent-border:${rgba(colors.accent, 0.3)}`,
    `--brand-neutral-border:${rgba(colors.text, 0.12)}`,
    `--brand-cta-text:${ctaText}`,
    `--brand-cta-button-text:${colors.primary}`,
    `--card-gradient:linear-gradient(180deg, ${rgba(colors.cardBackground, 0.98)}, ${rgba(colors.accent, 0.08)})`,
    `--grad-soft:linear-gradient(135deg, ${rgba(colors.accent, 0.14)} 0%, ${rgba(colors.secondary, 0.14)} 100%)`,
    `--grad-vibrant:linear-gradient(135deg, ${colors.accent} 0%, ${colors.secondary} 100%)`,
  ].join(";");
}

function buildCompanyLogoHtml(payload: ProposalPdfPayload, companyName: string): string {
  if (!payload.companyLogoDataUri?.trim()) return `<span class="dot"></span>`;

  return `<img class="company-logo" src="${escapeHtml(payload.companyLogoDataUri)}" alt="${escapeHtml(companyName)}" />`;
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
  yearlyCost: string,
): string {
  const priceClass = variant === "b" ? " price-b" : "";
  const badgeClass = variant === "b" ? " cost-badge-b" : " cost-badge-a";

  return html.replace(
    new RegExp(
      `(<div class="orb-wrapper orb-destination-small">[\\s\\S]*?<div class="orb-content">)[\\s\\S]*?(</div>\\s*</div>\\s*<div class="orb-footer-label footer-label-${variant}">)`,
    ),
    `$1
                                                <div class="display orb-price-sm${priceClass}">${escapeHtml(value)}</div>
                                                <div class="mono orb-unit-sm">${escapeHtml(unit)}</div>
                                                <div class="orb-yearly-cost orb-yearly-cost-sm${badgeClass}">${escapeHtml(yearlyCost)}</div>
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

function getExtraConsumptionLabels(language: AppLanguage): {
  title: string;
  hvac: string;
  ev: string;
  perYear: string;
} {
  if (language === "gl") {
    return {
      title: "Consumo extra",
      hvac: "Climatización",
      ev: "Vehículo eléctrico",
      perYear: "/ano",
    };
  }

  if (language === "ca" || language === "val") {
    return {
      title: "Consum extra",
      hvac: "Climatització",
      ev: "Vehicle elèctric",
      perYear: "/any",
    };
  }

  return {
    title: "Consumo extra",
    hvac: "Climatización",
    ev: "Vehículo eléctrico",
    perYear: "/año",
  };
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseNumberLike(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value !== "string") return 0;

  const cleaned = value.replace(/[^0-9,.-]/g, "").trim();
  if (!cleaned) return 0;

  const withoutThousands = cleaned.replace(/\.(?=\d{3}(?:\D|$))/g, "");
  const normalized = withoutThousands.includes(",")
    ? withoutThousands.replace(",", ".")
    : withoutThousands;

  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function firstPositiveNumber(
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): number {
  for (const source of sources) {
    if (!source) continue;

    for (const key of keys) {
      const numeric = parseNumberLike(source[key]);
      if (numeric > 0) return numeric;
    }
  }

  return 0;
}

function buildExtraConsumptionIconSvg(kind: "ev" | "hvac"): string {
  if (kind === "ev") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M7 14h10l-1.2-3.5A2.4 2.4 0 0 0 13.5 9h-3A2.4 2.4 0 0 0 8.2 10.5L7 14Z" />
                                <path d="M6 14h12v4H6z" />
                                <path d="M9 18v1.5M15 18v1.5M10 14l.8-2h2.4l.8 2" />
                                <path d="M16.5 6.2 14.7 9h2.2l-1.4 2.8" />
                                <circle cx="9" cy="16" r=".8" />
                                <circle cx="15" cy="16" r=".8" />
                              </svg>`;
  }

  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M12 4v2.2M12 17.8V20M4 12h2.2M17.8 12H20M6.3 6.3l1.6 1.6M16.1 16.1l1.6 1.6M6.3 17.7l1.6-1.6M16.1 7.9l1.6-1.6" />
                                <circle cx="12" cy="12" r="3.2" />
                                <path d="M12 8.8v6.4M8.8 12h6.4" />
                              </svg>`;
}

function hasBooleanFlag(
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): boolean {
  return sources.some((source) =>
    keys.some((key) => source?.[key] === true),
  );
}

function collectExtraConsumptionSources(
  payload: ProposalPdfPayload,
): Array<Record<string, unknown>> {
  const roots = [
    toRecord(payload.calculationResult),
    toRecord(payload.billData),
    ...payload.proposals.map((proposal) => toRecord(proposal)),
  ].filter(Boolean) as Array<Record<string, unknown>>;

  const nestedKeys = [
    "extraConsumption",
    "extraConsumptions",
    "extraConsumptionData",
    "additionalConsumption",
    "additionalConsumptions",
    "extras",
    "selectedExtras",
  ];

  return roots.flatMap((root) => [
    root,
    ...nestedKeys.map((key) => toRecord(root[key])).filter(Boolean),
  ] as Array<Record<string, unknown>>);
}

function collectNestedSources(
  sources: Array<Record<string, unknown>>,
  keys: string[],
): Array<Record<string, unknown>> {
  return sources.flatMap((source) =>
    keys.map((key) => toRecord(source[key])).filter(Boolean),
  ) as Array<Record<string, unknown>>;
}

function buildExtraConsumptionHtml(
  payload: ProposalPdfPayload,
  language: AppLanguage,
): string {
  const labels = getExtraConsumptionLabels(language);
  const sources = collectExtraConsumptionSources(payload);

  const hvacNestedSources = collectNestedSources(sources, [
    "hvac",
    "clima",
    "climatizacion",
    "airConditioning",
    "heatingCooling",
  ]);

  const evNestedSources = collectNestedSources(sources, [
    "ev",
    "electricVehicle",
    "vehicle",
    "cocheElectrico",
  ]);

  const hvacM2 = firstPositiveNumber(sources, [
    "hvacSquareMeters",
    "extraConsumptionHvacM2",
    "hvacM2",
    "climatizacionM2",
    "climateAreaM2",
    "airConditioningM2",
  ]) || firstPositiveNumber(hvacNestedSources, [
    "m2",
    "sqm",
    "surfaceM2",
    "areaM2",
    "squareMeters",
  ]);

  const hvacKw = firstPositiveNumber(sources, [
    "kw",
    "hvacKw",
    "climatizacionKw",
    "climatePowerKw",
    "airConditioningKw",
  ]) || firstPositiveNumber(hvacNestedSources, [
    "powerKw",
  ]);

  const hvacKwh = firstPositiveNumber(sources, [
    "hvacAnnualKwh",
    "hvacAnnualConsumptionKwh",
    "extraConsumptionHvacKwh",
    "climatizacionAnnualKwh",
  ]) || firstPositiveNumber(hvacNestedSources, [
    "extraKwh",
    "extraConsumptionKwh",
    "annualKwh",
    "annualConsumptionKwh",
    "kwh",
  ]);

  const evKmYear = firstPositiveNumber(sources, [
    "extraConsumptionEvKmYear",
    "evKmYear",
    "evAnnualKm",
    "electricVehicleKmYear",
  ]) || firstPositiveNumber(evNestedSources, [
    "kmYear",
    "kmsYear",
    "annualKm",
    "annualKms",
    "kmPerYear",
  ]);

  const evKwh = firstPositiveNumber(sources, [
    "evAnnualKwh",
    "evAnnualConsumptionKwh",
    "extraConsumptionEvKwh",
    "electricVehicleAnnualKwh",
  ]) || firstPositiveNumber(evNestedSources, [
    "extraKwh",
    "extraConsumptionKwh",
    "annualKwh",
    "annualConsumptionKwh",
    "kwh",
  ]);

  const hasHvac =
    hvacM2 > 0 ||
    hvacKw > 0 ||
    hvacKwh > 0 ||
    hasBooleanFlag(sources, ["hvac", "clima", "climatizacion", "airConditioning"]);
  const hasEv =
    evKmYear > 0 ||
    evKwh > 0 ||
    hasBooleanFlag(sources, ["ev", "electricVehicle", "vehicle", "cocheElectrico"]);
  const pills: string[] = [];

  if (hasHvac) {
    const detail = hvacM2 > 0 || hvacKw > 0
      ? [
          hvacM2 > 0 ? `${formatNumber(hvacM2, language, 0)} m²` : null,
          hvacKw > 0 ? `${formatNumber(hvacKw, language, 1, 1)} kW` : null,
        ].filter(Boolean).join(" + ")
      : hvacKwh > 0
        ? `${formatKwh(hvacKwh, language)}${labels.perYear}`
        : "";

    pills.push(`<div class="extra-consumption-pill extra-consumption-hvac">
                              <span class="extra-consumption-icon">${buildExtraConsumptionIconSvg("hvac")}</span>
                              <span><strong>${escapeHtml(labels.hvac)}</strong><small>${escapeHtml(detail)}</small></span>
                          </div>`);
  }

  if (hasEv) {
    const detail = evKmYear > 0
      ? `${formatNumber(evKmYear, language, 0)} km${labels.perYear}`
      : evKwh > 0
        ? `${formatKwh(evKwh, language)}${labels.perYear}`
        : "";

    pills.push(`<div class="extra-consumption-pill extra-consumption-ev">
                              <span class="extra-consumption-icon">${buildExtraConsumptionIconSvg("ev")}</span>
                              <span><strong>${escapeHtml(labels.ev)}</strong><small>${escapeHtml(detail)}</small></span>
                          </div>`);
  }

  if (!pills.length) return "";

  return `<div class="extra-consumption-pills">
                          <span class="extra-consumption-title">${escapeHtml(labels.title)}</span>
                          ${pills.join("\n                          ")}
                      </div>`;
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

function formatTariffType(billType: BillData["billType"]): string {
  if (billType === "3TD") return "3.0TD";
  return "2.0TD";
}

function contractedPowerLabels(language: AppLanguage): { peak: string; valley: string } {
  if (language === "ca" || language === "val") {
    return { peak: "Potencia punta", valley: "Potencia vall" };
  }

  if (language === "gl") {
    return { peak: "Potencia punta", valley: "Potencia val" };
  }

  return { peak: "Potencia punta", valley: "Potencia valle" };
}

function parsePowerValuesFromText(text: string): number[] {
  return [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*kW/gi)]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function contractedPower(billData: BillData, language: AppLanguage): string {
  const labels = contractedPowerLabels(language);
  const textPowers = billData.contractedPowerText?.trim()
    ? parsePowerValuesFromText(billData.contractedPowerText)
    : [];
  const fallbackPower = positive(billData.contractedPowerKw, positive(textPowers[0]));
  const peakPower = positive(billData.contractedPowerP1, fallbackPower);
  const valleyPower = positive(billData.contractedPowerP2, positive(textPowers[1], peakPower));

  if (peakPower || valleyPower) {
    const peak = peakPower ? formatNumber(peakPower, language, 1, 1) : "-";
    const valley = valleyPower ? formatNumber(valleyPower, language, 1, 1) : "-";
    return `${labels.peak}: ${peak} kW · ${labels.valley}: ${valley} kW`;
  }

  if (billData.contractedPowerText?.trim()) return billData.contractedPowerText.trim();

  return "-";
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
  investmentTotalSavings25Years: number;
  investmentUsesFixedDisplay?: boolean;
  language: AppLanguage;
  service?: ProposalPdfSummary;
  serviceEnergyPrice: number;
  serviceFixedAmount?: number;
  serviceTotalCost25Years: number;
  serviceTotalSavings25Years: number;
  serviceUsesFixedDisplay?: boolean;
  serviceColor: string;
  texts: ReturnType<typeof getProposalPdfTexts>;
  investmentColor: string;
}): string {
  const labels = getSavingsNoteLabels(params.language);
  const modeSummary = (
    proposal: ProposalPdfSummary | undefined,
    color: string,
    total25Years: number,
    className: string,
  ) => {
    if (!proposal) return "";

    const annualSavings = positive(proposal.annualSavings);
    const monthlySavings = annualSavings / 12;

    return `<div class="orbit-savings ${className}" style="--orbit-color:${color};">
        <div class="orbit-saving-label orbit-saving-monthly"><span>${labels.monthly}</span><strong>${formatCurrency(monthlySavings, params.language)}</strong></div>
        <div class="orbit-saving-label orbit-saving-annual"><span>${labels.annual}</span><strong>${formatCurrency(annualSavings, params.language)}</strong></div>
        <div class="orbit-saving-label orbit-saving-total"><span>${labels.total25Years}</span><strong>${formatCurrency(total25Years, params.language)}</strong></div>
      </div>`;
  };

  return `<div class="stability-orbit-notes orbit-savings-layer">
      ${modeSummary(params.service, params.serviceColor, params.serviceTotalSavings25Years, "orbit-savings-service")}
      ${modeSummary(params.investment, params.investmentColor, params.investmentTotalSavings25Years, "orbit-savings-investment")}
    </div>`;
}

function buildStabilityGraphHtml(params: {
  currentColor: string;
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
  serviceColor: string;
  texts: ReturnType<typeof getProposalPdfTexts>;
  investmentColor: string;
}): string {
  const years = Array.from({ length: PROJECTION_YEARS + 1 }, (_, i) => i);
  const currentLine = years.map((y) => params.currentPrice * Math.pow(1 + PROJECTION_IPC_RATE, y));
  const chart = { left: 58, right: 690, top: 30, bottom: 178 };

  const series = [
    {
      color: params.currentColor,
      gradientId: "currentPriceGradient",
      key: "current",
      label: params.texts.currentBillLegend,
      points: currentLine,
      stopColor: params.currentColor,
    },
    params.service && !params.serviceUsesFixedDisplay
      ? {
          color: params.serviceColor,
          gradientId: "servicePriceGradient",
          key: "service",
          label: params.texts.serviceLegend,
          points: years.map(() => params.serviceEnergyPrice),
          stopColor: params.serviceColor,
        }
      : null,
    params.investment && !params.investmentUsesFixedDisplay
      ? {
          color: params.investmentColor,
          gradientId: "investmentPriceGradient",
          key: "investment",
          label: params.texts.investmentLegend,
          points: years.map(() => params.investmentEnergyPrice),
          stopColor: params.investmentColor,
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const allValues = series.flatMap((item) => item.points);
  const scale = getChartScale(allValues);

  const gridLines = scale.ticks
    .map((tick) => {
      const y = chartPointY(tick, chart, scale.min, scale.max);
      return `<g>
          <line x1="${chart.left}" x2="${chart.right}" y1="${formatSvgNumber(y)}" y2="${formatSvgNumber(y)}" stroke="var(--brand-neutral-border)" stroke-width="1" />
          <text x="${chart.left - 12}" y="${formatSvgNumber(y + 3)}" text-anchor="end" font-size="9" fill="var(--text-muted)" font-family="Cabin, Arial, sans-serif" font-weight="600">${formatEnergyPrice(tick, params.language)}</text>
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
          <line x1="${formatSvgNumber(x)}" x2="${formatSvgNumber(x)}" y1="${chart.top}" y2="${chart.bottom}" stroke="var(--brand-neutral-border)" stroke-width="1" stroke-dasharray="3 5" />
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

        return `<circle cx="${formatSvgNumber(x)}" cy="${formatSvgNumber(y)}" r="3.7" fill="${item.color}" stroke="var(--bg-card)" stroke-width="2" />`;
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
          ? y - 26
          : item.key === "service"
            ? y - 26
            : y + 10;
        const boxX = Math.min(Math.max(x - boxWidth / 2, chart.left + 2), chart.right - boxWidth - 2);
        const boxY = Math.min(
          Math.max(preferredY + (seriesIndex === 0 ? 0 : seriesIndex * 2), chart.top + 2),
          chart.bottom - boxHeight - 2,
        );

        return `<g>
          <rect x="${formatSvgNumber(boxX)}" y="${formatSvgNumber(boxY)}" width="${boxWidth}" height="${boxHeight}" rx="6" fill="var(--bg-card)" fill-opacity="0.94" stroke="${item.color}" stroke-opacity="0.36" />
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

  return `<div class="proposal-stability-graph" style="margin:58px 0 30px;">
                  <div class="eyebrow graph-section-eyebrow">${escapeHtml(params.texts.stabilityTitle)}</div>
                  <div class="graph-block condensed-graph p2-graph-block clean-stability-chart" style="padding:18px 24px 20px;background:var(--bg-card);border:1px solid var(--brand-neutral-border);border-radius:10px;box-shadow:none;overflow:hidden;">
                    <div style="max-width:720px;margin:0 auto;">
                      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:8px;">
                        <div style="font-size:10px;line-height:1.35;color:var(--text-light);font-weight:600;max-width:330px;">${escapeHtml(getProjectionFootnote(params.language))}</div>
                        <div style="display:flex;gap:12px;align-items:center;color:var(--text-muted);font-size:9px;font-weight:700;white-space:nowrap;">${legendItems}</div>
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
                        <rect x="0" y="0" width="748" height="230" rx="8" fill="var(--bg-card)" />
                        ${gridLines}
                        ${milestoneGuides}
                        <line x1="${chart.left}" x2="${chart.right}" y1="${chart.bottom}" y2="${chart.bottom}" stroke="var(--brand-neutral-border)" stroke-width="1" />
                        ${seriesAreas}
                        ${seriesLines}
                        ${milestoneDots}
                        ${milestoneLabels}
                        ${milestoneYears
                          .map((year) => {
                            const x = chart.left + ((chart.right - chart.left) / PROJECTION_YEARS) * year;
                            return `<text x="${formatSvgNumber(x)}" y="214" text-anchor="middle" font-size="9.5" fill="var(--text-muted)" font-family="Cabin, Arial, sans-serif" font-weight="800">${yearLabels[year]}</text>`;
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

  const rawServiceDiscount = service ? discountFromPrice(currentPrice, serviceEnergyPrice) : 0;
  const serviceDiscount =
    rawServiceDiscount === 0 && serviceAnnualSavings > 0
      ? clampPercent(Math.round((serviceAnnualSavings / Math.max(currentAnnualCost, 1)) * 100))
      : rawServiceDiscount;

  const rawInvestmentDiscount = investment ? discountFromPrice(currentPrice, investmentEnergyPrice) : 0;
  const investmentDiscount =
    rawInvestmentDiscount === 0 && investmentAnnualSavings > 0
      ? clampPercent(Math.round((investmentAnnualSavings / Math.max(currentAnnualCost, 1)) * 100))
      : rawInvestmentDiscount;

  const bestDiscount = Math.max(
    service ? serviceDiscount : 0,
    investment ? investmentDiscount : 0,
  );

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
  const companyLogoHtml = buildCompanyLogoHtml(payload, companyName);
  const brandColors = buildBrandColors(preferred);
  const brandStyle = buildBrandStyle(brandColors);
  const coverTitleHtml = buildCoverTitleHtml({ language, proposal: preferred, texts });
  const paybackText = investmentPaybackYears
    ? `${formatNumber(investmentPaybackYears, language, 1, 1)} ${texts.yearsLabel}`
    : "-";
  const serviceTotalSavings25Years = positive(
    service?.totalSavings25Years,
    positive(result.totalSavings25YearsService),
  );
  const investmentTotalSavings25Years = positive(
    investment?.totalSavings25Years,
    positive(result.totalSavings25YearsInvestment),
  );

  console.log("[proposal-pdf-html:25y]", {
    result: {
      annualSavingsInvestment: result.annualSavingsInvestment,
      annualSavingsService: result.annualSavingsService,
      totalSavings25YearsInvestment: result.totalSavings25YearsInvestment,
      totalSavings25YearsService: result.totalSavings25YearsService,
    },
    proposals: {
      investment: {
        annualSavings: investment?.annualSavings,
        totalSavings25Years: investment?.totalSavings25Years,
        expectedTotalSavings25Years:
          typeof investment?.annualSavings === "number"
            ? investment.annualSavings * 25
            : null,
      },
      service: {
        annualSavings: service?.annualSavings,
        totalSavings25Years: service?.totalSavings25Years,
        expectedTotalSavings25Years:
          typeof service?.annualSavings === "number"
            ? service.annualSavings * 25
            : null,
      },
    },
    rendered: {
      investmentTotalSavings25Years,
      serviceTotalSavings25Years,
    },
  });

  return {
    clientName: fullName(billData, texts.clientFallback),
    clientMeta: `${locationFromAddress(billData.address, texts.pendingLocation)} · ${formatMonthYear(language)}`,
    annualConsumption: `${formatKwh(annualConsumptionKwh, language)}${texts.annualSuffix}`,
    tariff: `${formatTariffType(billData.billType)} · ${contractedPower(billData, language)}`,
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
    serviceAnnualCost: `${formatCurrency(annualServiceFee, language)}${texts.annualSuffix}`,
    investmentUpfrontCost: formatCurrency(upfrontCost, language),
    investmentAnnualCost: `${formatCurrency(investmentTotalCost25Years / PROJECTION_YEARS, language)}${texts.annualSuffix}`,
    serviceAnnualSavings: formatCurrency(serviceAnnualSavings, language),
    investmentAnnualSavings: formatCurrency(investmentAnnualSavings, language),
    serviceTotalSavings: formatCurrency(serviceTotalSavings25Years, language),
    investmentTotalSavings: formatCurrency(investmentTotalSavings25Years, language),
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
        savings: formatCurrency(investmentTotalSavings25Years, language),
      },
    ),
    contact: contact || texts.pendingContact,
    companyName,
    companyEmail,
    companyLogoHtml,
    reserveHref,
    brandStyle,
    coverTitleHtml,
    extraConsumptionHtml: buildExtraConsumptionHtml(payload, language),
    stabilityChartHtml: buildStabilityOrbitHtml({
      currentAnnualCost,
      currentComparableAnnualCost,
      currentPrice,
      investment,
      investmentEnergyPrice,
      investmentFixedAmount: upfrontCost,
      investmentTotalCost25Years,
      investmentTotalSavings25Years,
      investmentUsesFixedDisplay,
      language,
      service,
      serviceEnergyPrice,
      serviceColor: brandColors.secondary,
      serviceFixedAmount: monthlyFee,
      serviceTotalCost25Years,
      serviceTotalSavings25Years,
      serviceUsesFixedDisplay,
      texts,
      investmentColor: brandColors.accent,
    }),
    stabilityGraphHtml: buildStabilityGraphHtml({
      currentColor: brandColors.primary,
      currentComparableAnnualCost,
      currentPrice,
      investment,
      investmentEnergyPrice,
      investmentFixedAmount: upfrontCost,
      investmentTotalCost25Years,
      investmentUsesFixedDisplay,
      investmentColor: brandColors.accent,
      language,
      service,
      serviceEnergyPrice,
      serviceFixedAmount: monthlyFee,
      serviceTotalCost25Years,
      serviceUsesFixedDisplay,
      serviceColor: brandColors.secondary,
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
    `<div class="solar-comun-informe-wrapper condensed-view new-vibrant-design design-final">`,
    `<div class="solar-comun-informe-wrapper condensed-view new-vibrant-design design-final" style="${values.brandStyle}">`,
  );
  html = replaceRaw(
    html,
    `<title>Propuesta Solar Común</title>`,
    `<title>Propuesta ${escapeHtml(values.companyName)}</title>`,
  );
  html = replaceRaw(
    html,
    `<span class="dot"></span>
                            <span>Solar <em style="font-family: Cabin, sans-serif; font-style: italic; font-weight: 400;">Común</em></span>`,
    `${values.companyLogoHtml}
                            <span class="company-name">${escapeHtml(values.companyName)}</span>`,
  );
  html = replaceRaw(
    html,
    `<span class="dot"></span>
                        <span>Solar <em style="font-family: Cabin, sans-serif; font-style: italic; font-weight: 400;">Común</em></span>`,
    `${values.companyLogoHtml}
                        <span class="company-name">${escapeHtml(values.companyName)}</span>`,
  );
  html = html.replace(
    /<span class="dot"><\/span>\s*<span>Solar <em style="font-family: Cabin, sans-serif; font-style: italic; font-weight: 400;">Común<\/em><\/span>/g,
    `${values.companyLogoHtml}<span class="company-name">${escapeHtml(values.companyName)}</span>`,
  );
  html = replaceText(html, "Propuesta · Participación", texts.coverEyebrow);
  html = replaceRaw(
    html,
    `<h1 class="display main-title">La energía, <em>en tus manos</em> sin tocar tu tejado.</h1>`,
    `<h1 class="display main-title">${values.coverTitleHtml}</h1>`,
  );
  html = replaceText(
    html,
    "Participa en la planta solar comunitaria de tu zona. Sin obras, sin cambio de compañía, y con un ahorro real en tu factura.",
    texts.coverDescription,
  );
  html = replaceRaw(
    html,
    "<!-- EXTRA_CONSUMPTION_PILLS -->",
    values.extraConsumptionHtml,
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
    `<a class="cta-button" href="${escapeHtml(values.reserveHref)}" target="_blank" rel="noopener noreferrer" style="display:flex;text-decoration:none;"><span>${escapeHtml(texts.reserveCta.replace(/\s*→\s*$/, ""))}</span></a>`,
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

  if (!html.includes(`href="${escapeHtml(values.reserveHref)}"`)) {
    const reserveLabel = escapeHtml(texts.reserveCta.replace(/\s*→\s*$/, ""));
    html = html.replace(
      /<div class="cta-button">([^<]*)(\s*<svg[\s\S]*?<\/svg>)(?:\s*<span>[^<]*<\/span>)?<\/div>/,
      `<a class="cta-button" href="${escapeHtml(values.reserveHref)}" target="_blank" rel="noopener noreferrer" style="display:flex;text-decoration:none;"><span>${reserveLabel}</span></a>`,
    );
  }

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
      values.serviceAnnualCost,
    );
  }

  if (investmentUsesFixedDisplay) {
    html = replaceOrbContent(
      html,
      "b",
      values.investmentUpfrontCost,
      texts.investmentCardTitle.toLowerCase(),
      values.investmentAnnualCost,
    );
  }

  html = replaceRaw(html, "__SERVICE_ANNUAL_COST__", escapeHtml(values.serviceAnnualCost));
  html = replaceRaw(html, "__INVESTMENT_ANNUAL_COST__", escapeHtml(values.investmentAnnualCost));

  html = removeFirstElementByClass(html, "modalities-section");

  return html;
}
