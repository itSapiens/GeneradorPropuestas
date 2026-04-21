export type BillType = "2TD" | "3TD";
export type PeriodKey = "P1" | "P2" | "P3" | "P4" | "P5" | "P6";
// Compatible con Supabase installations.modalidad
export type Modality = "inversion" | "servicio" | "ambas";

export interface CalculationInput {
  monthlyConsumptionKwh: number;
  billType: BillType;
  effectiveHours: number;

  investmentCostKwh: number;
  serviceCostKwh: number;
  selfConsumptionRatio: number;

  // Modalidad de la instalación seleccionada (Supabase installations.modalidad)
  modality?: Modality;

  invoiceConsumptionKwh?: number;
  monthlyChartConsumptions?: number[];
  periodPrices?: Partial<Record<PeriodKey, number>>;
  periodConsumptions?: Partial<Record<PeriodKey, number>>;

  surplusCompensationPriceKwh?: number;
  maintenanceAnnualPerKwp?: number;
  vatRate?: number;

  // IPC energético anual (ej. 0.03 = 3%/año). Solo se aplica a la proyección a 25 años.
  energyPriceInflation?: number;

  invoiceVariableEnergyAmountEur?: number;

  // Si llega > 0, esta potencia manda sobre la calculada automática
  forcedPowerKwp?: number;
}

export interface ChartBarItem {
  label: string;
  value: number;
}

export interface PeriodChartItem {
  label: PeriodKey;
  value: number;
  percentage: number;
}

export interface CalculationResult {
  annualConsumptionKwh: number;
  averageMonthlyConsumptionKwh: number;
  invoiceConsumptionKwh: number;

  recommendedPowerKwp: number;

  investmentCost: number;
  serviceCost: number;

  annualSavingsInvestment: number;
  annualSavingsService: number;

  monthlySavingsInvestment: number;
  monthlySavingsService: number;

  dailySavingsInvestment: number;
  dailySavingsService: number;

  annualSavings25YearsInvestment: number;
  annualSavings25YearsService: number;

  // Alias útiles para no romper otras partes del proyecto
  totalSavings25YearsInvestment: number;
  totalSavings25YearsService: number;

  estimatedAnnualProductionKwh: number;
  estimatedMonthlyEnergyCost: number;
  estimatedAnnualEnergyCost: number;

  weightedEnergyPriceKwh: number;

  selfConsumptionRatio: number;
  viabilityScore: number;
  paybackYears: number | null;

  // Nuevos campos detallados
  invoicePriceWithVatKwh: number;
  surplusCompensationPriceKwh: number;

  annualSelfConsumedEnergyKwh: number;
  annualSurplusEnergyKwh: number;

  annualSelfConsumptionValue: number;
  annualSurplusValue: number;
  annualGrossSolarValue: number;

  annualMaintenanceCost: number;
  annualServiceFee: number;

  periodDistribution: Record<PeriodKey, number>;
  periodPercentages: Record<PeriodKey, number>;

  charts: {
    savingsProjectionInvestment: ChartBarItem[];
    savingsProjectionService: ChartBarItem[];
    periodDistribution: PeriodChartItem[];
  };

  formulaVersion: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES DE CÁLCULO — modifica aquí para ajustar el modelo económico
// ═══════════════════════════════════════════════════════════════════════════

/** Precio medio €/kWh usado cuando no se puede extraer de la factura */
const DEFAULT_WEIGHTED_ENERGY_PRICE_KWH = 0.18;

/** Coste de mantenimiento anual por kWp instalado (€/kWp/año) — modalidad inversión.
 *  0 = incluido en el precio de la instalación (no se descuenta del ahorro del cliente). */
const DEFAULT_MAINTENANCE_ANNUAL_PER_KWP = 0;

/** IVA aplicado a la factura eléctrica en España */
const DEFAULT_VAT_RATE = 0.21;

/** Impuesto sobre la electricidad (Ley 38/1992) — se aplica sobre base antes del IVA */
const ELECTRIC_TAX_RATE = 0.05113;

/** Precio de compensación de excedentes por defecto (€/kWh). 0 = sin compensación */
const DEFAULT_SURPLUS_COMPENSATION_PRICE_KWH = 0;

/** IPC energético anual por defecto para proyección a 25 años (3%/año histórico España) */
const DEFAULT_ENERGY_PRICE_INFLATION = 0.03;

/** Años de proyección para el cálculo de ahorro acumulado */
const PROJECTION_YEARS = 25;

// ═══════════════════════════════════════════════════════════════════════════

const PERIOD_PERCENTAGES: Record<BillType, Record<PeriodKey, number>> = {
  "2TD": {
    P1: 0.385,
    P2: 0.342,
    P3: 0.273,
    P4: 0,
    P5: 0,
    P6: 0,
  },
  "3TD": {
    P1: 0.124,
    P2: 0.181,
    P3: 0.156,
    P4: 0.148,
    P5: 0.109,
    P6: 0.282,
  },
};

const ALL_PERIODS: PeriodKey[] = ["P1", "P2", "P3", "P4", "P5", "P6"];


function round(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(decimals));
}

function normalizePositive(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return value;
}

function normalizeRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > 1 ? value / 100 : value;
}

function clampRatio(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function roundUpToHalf(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value * 2) / 2;
}

/**
 * Proyecta un ahorro anual a N años aplicando crecimiento compuesto (IPC energético).
 * Suma de una serie geométrica: A·((1+r)^N − 1) / r
 * Si r = 0, equivale a A × N.
 */
function projectWithInflation(
  annualValue: number,
  years: number,
  rate: number,
): number {
  if (!Number.isFinite(annualValue) || annualValue <= 0 || years <= 0) return 0;
  if (rate <= 0) return annualValue * years;
  return (annualValue * (Math.pow(1 + rate, years) - 1)) / rate;
}

function averageValid(values?: number[]): number | undefined {
  if (!Array.isArray(values)) return undefined;

  const clean = values.filter(
    (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
  );

  if (!clean.length) return undefined;

  return clean.reduce((acc, value) => acc + value, 0) / clean.length;
}

function resolveWeightedEnergyPrice(
  billType: BillType,
  periodPrices?: Partial<Record<PeriodKey, number>>,
  periodConsumptions?: Partial<Record<PeriodKey, number>>,
  invoiceVariableEnergyAmountEur?: number,
  invoiceConsumptionKwh?: number,
): number | undefined {
  const validInvoiceConsumption =
    typeof invoiceConsumptionKwh === "number" &&
    Number.isFinite(invoiceConsumptionKwh) &&
    invoiceConsumptionKwh > 0;

  const validVariableAmount =
    typeof invoiceVariableEnergyAmountEur === "number" &&
    Number.isFinite(invoiceVariableEnergyAmountEur) &&
    invoiceVariableEnergyAmountEur > 0;

  // 1) Mejor opción: precio real medio de la factura
  if (validVariableAmount && validInvoiceConsumption) {
    return invoiceVariableEnergyAmountEur / invoiceConsumptionKwh;
  }

  // 2) Segunda mejor opción: ponderar con consumos reales por periodo
  if (periodPrices && periodConsumptions) {
    let totalCost = 0;
    let totalKwh = 0;

    for (const period of ALL_PERIODS) {
      const price = periodPrices[period];
      const kwh = periodConsumptions[period];

      if (
        typeof price === "number" &&
        Number.isFinite(price) &&
        price > 0 &&
        typeof kwh === "number" &&
        Number.isFinite(kwh) &&
        kwh > 0
      ) {
        totalCost += price * kwh;
        totalKwh += kwh;
      }
    }

    if (totalKwh > 0) {
      return totalCost / totalKwh;
    }
  }

  // 3) Fallback antiguo
  if (periodPrices) {
    const weights = PERIOD_PERCENTAGES[billType];
    let weightedSum = 0;
    let usedWeight = 0;

    for (const period of ALL_PERIODS) {
      const price = periodPrices[period];
      const weight = weights[period];

      if (
        typeof price === "number" &&
        Number.isFinite(price) &&
        price > 0 &&
        weight > 0
      ) {
        weightedSum += price * weight;
        usedWeight += weight;
      }
    }

    if (usedWeight > 0) {
      return weightedSum / usedWeight;
    }

    const availablePrices = Object.values(periodPrices).filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value > 0,
    );

    if (availablePrices.length) {
      return (
        availablePrices.reduce((acc, value) => acc + value, 0) /
        availablePrices.length
      );
    }
  }

  return undefined;
}

function buildPeriodDistribution(
  billType: BillType,
  invoiceConsumptionKwh: number,
): {
  distribution: Record<PeriodKey, number>;
  percentages: Record<PeriodKey, number>;
} {
  const percentages = PERIOD_PERCENTAGES[billType];

  const distribution = ALL_PERIODS.reduce(
    (acc, period) => {
      acc[period] = round(invoiceConsumptionKwh * percentages[period], 2);
      return acc;
    },
    {} as Record<PeriodKey, number>,
  );

  return { distribution, percentages };
}

export const calculateEnergyStudy = (
  input: CalculationInput,
): CalculationResult => {
  const billType = input.billType;

  const effectiveHours = Math.max(1, normalizePositive(input.effectiveHours, 1));
  const selfConsumptionRatio = clampRatio(
    normalizeRatio(input.selfConsumptionRatio),
  );

  const graphAverage = averageValid(input.monthlyChartConsumptions);

  // Orden de preferencia: 1) media del gráfico mensual, 2) consumo mensual declarado,
  // 3) consumo de la factura. Antes el fallback 3 nunca se evaluaba porque
  // normalizePositive devolvía 0 en vez de undefined.
  const manualMonthly =
    typeof input.monthlyConsumptionKwh === "number" &&
    Number.isFinite(input.monthlyConsumptionKwh) &&
    input.monthlyConsumptionKwh > 0
      ? input.monthlyConsumptionKwh
      : undefined;

  const invoiceMonthlyFallback =
    typeof input.invoiceConsumptionKwh === "number" &&
    Number.isFinite(input.invoiceConsumptionKwh) &&
    input.invoiceConsumptionKwh > 0
      ? input.invoiceConsumptionKwh
      : undefined;

  const averageMonthlyConsumptionKwh = round(
    graphAverage ?? manualMonthly ?? invoiceMonthlyFallback ?? 0,
  );

  const invoiceConsumptionKwh = round(
    normalizePositive(input.invoiceConsumptionKwh, averageMonthlyConsumptionKwh),
  );

  const annualConsumptionKwh = round(averageMonthlyConsumptionKwh * 12);

  // Potencia recomendada automática
  const rawPower = annualConsumptionKwh / effectiveHours;
  const calculatedPowerKwp = roundUpToHalf(rawPower);

  // Si llega una potencia fija > 0, manda sobre la calculada
  const forcedPowerKwp = normalizePositive(input.forcedPowerKwp, 0);

  const recommendedPowerKwp =
    forcedPowerKwp > 0 ? round(forcedPowerKwp, 2) : calculatedPowerKwp;

  // ── 1. PRECIO €/kWh DE LA FACTURA ─────────────────────────────────────
  // Precio medio detectado en factura
  const weightedEnergyPriceKwh = round(
    resolveWeightedEnergyPrice(
      billType,
      input.periodPrices,
      input.periodConsumptions,
      input.invoiceVariableEnergyAmountEur,
      invoiceConsumptionKwh,
    ) ?? DEFAULT_WEIGHTED_ENERGY_PRICE_KWH,
    5,
  );

  // Precio factura con impuestos aplicados en cascada:
  //   precio_final = base × (1 + impuesto_eléctrico) × (1 + IVA)
  // El impuesto eléctrico (Ley 38/1992) se aplica ANTES del IVA, ya que el IVA
  // se calcula sobre la base imponible + impuesto eléctrico.
  // Nota: aunque la variable se llama "WithVat" por compatibilidad histórica,
  // el valor incluye también el impuesto eléctrico.
  const vatRate = normalizePositive(input.vatRate, DEFAULT_VAT_RATE);
  const invoicePriceWithVatKwh = round(
    weightedEnergyPriceKwh * (1 + ELECTRIC_TAX_RATE) * (1 + vatRate),
    5,
  );

  // Precio excedentes
  const surplusCompensationPriceKwh = round(
    normalizePositive(
      input.surplusCompensationPriceKwh,
      DEFAULT_SURPLUS_COMPENSATION_PRICE_KWH,
    ),
    5,
  );

  // ── 2. PRODUCCIÓN SOLAR Y AUTOCONSUMO ──────────────────────────────────
  // Producción anual estimada
  const estimatedAnnualProductionKwh = round(
    effectiveHours * recommendedPowerKwp,
  );

  // Energía solar que el cliente consume directamente (no se vierte a red)
  const annualSelfConsumedEnergyKwh = round(
    recommendedPowerKwp * effectiveHours * selfConsumptionRatio,
  );

  const annualSurplusEnergyKwh = round(
    Math.max(estimatedAnnualProductionKwh - annualSelfConsumedEnergyKwh, 0),
  );

  // Valor económico bruto
  const annualSelfConsumptionValue = round(
    annualSelfConsumedEnergyKwh * invoicePriceWithVatKwh,
  );

  const annualSurplusValue = round(
    annualSurplusEnergyKwh * surplusCompensationPriceKwh,
  );

  const annualGrossSolarValue = round(
    annualSelfConsumptionValue + annualSurplusValue,
  );

  // ── 3. COSTES ANUALES (mantenimiento / cuota servicio / inversión) ──────
  const maintenanceAnnualPerKwp = normalizePositive(
    input.maintenanceAnnualPerKwp,
    DEFAULT_MAINTENANCE_ANNUAL_PER_KWP,
  );

  const annualMaintenanceCost = round(
    maintenanceAnnualPerKwp * recommendedPowerKwp,
  );

  // Cuota anual del servicio (modalidad PPA).
  // El cliente paga coste_kwh_servicio SOLO por la energía solar que consume
  // (no por la producción total: los excedentes van a red y no se facturan como servicio).
  const annualServiceFee = round(
    annualSelfConsumedEnergyKwh * normalizePositive(input.serviceCostKwh, 0),
  );

  // Coste de inversión (CapEx único, modalidad compra)
  const investmentCost = round(
    recommendedPowerKwp * normalizePositive(input.investmentCostKwh, 0),
  );

  // Coste anual del servicio (OpEx recurrente)
  const serviceCost = round(annualServiceFee);

  // Factura sin solar (referencia para calcular ahorros y score)
  const estimatedMonthlyEnergyCost = round(
    averageMonthlyConsumptionKwh * invoicePriceWithVatKwh,
  );

  const estimatedAnnualEnergyCost = round(
    annualConsumptionKwh * invoicePriceWithVatKwh,
  );

  // ── 4. AHORRO ANUAL ──────────────────────────────────────────────────────
  // ----- AHORRO MODALIDAD INVERSIÓN -----
  // Bruto = autoconsumo + excedentes; Neto = bruto − mantenimiento anual
  const annualSavingsInvestment = round(
    Math.max(annualGrossSolarValue - annualMaintenanceCost, 0),
  );

  // ----- AHORRO MODALIDAD SERVICIO (PPA) -----
  // factura_sin_solar = consumo × precio
  // factura_con_servicio = (consumo − autoconsumido) × precio + annualServiceFee − excedentes × comp
  // ahorro = autoconsumido × precio + excedentes × comp − annualServiceFee
  //        = annualGrossSolarValue − annualServiceFee
  const annualSavingsService = round(
    Math.max(annualGrossSolarValue - annualServiceFee, 0),
  );

  const monthlySavingsInvestment = round(annualSavingsInvestment / 12);
  const monthlySavingsService = round(annualSavingsService / 12);

  const dailySavingsInvestment = round(annualSavingsInvestment / 365);
  const dailySavingsService = round(annualSavingsService / 365);

  // ── 5. PROYECCIÓN A 25 AÑOS ───────────────────────────────────────────
  // Proyección con IPC energético (crecimiento compuesto)
  const energyPriceInflation = normalizePositive(
    input.energyPriceInflation,
    DEFAULT_ENERGY_PRICE_INFLATION,
  );

  const annualSavings25YearsInvestment = round(
    projectWithInflation(
      annualSavingsInvestment,
      PROJECTION_YEARS,
      energyPriceInflation,
    ),
  );
  const annualSavings25YearsService = round(
    projectWithInflation(
      annualSavingsService,
      PROJECTION_YEARS,
      energyPriceInflation,
    ),
  );

  const totalSavings25YearsInvestment = annualSavings25YearsInvestment;
  const totalSavings25YearsService = annualSavings25YearsService;

  // ----- PAYBACK -----
  // Solo tiene sentido en modalidad inversión (hay CapEx que amortizar).
  // En modalidad servicio no hay desembolso inicial, así que payback = null.
  const modality: Modality = input.modality ?? "inversion";
  const paybackYears =
    modality !== "servicio" && annualSavingsInvestment > 0
      ? round(investmentCost / annualSavingsInvestment, 1)
      : null;

  const { distribution, percentages } = buildPeriodDistribution(
    billType,
    invoiceConsumptionKwh,
  );

  // Viability score = % de ahorro anual respecto a lo que el cliente pagaría sin solar.
  // Usamos el mejor de los dos modelos (inversión o servicio) como referencia del
  // potencial de la instalación. Se limita a [0, 100].
  const bestAnnualSavings = Math.max(
    annualSavingsInvestment,
    annualSavingsService,
  );
  const viabilityScore =
    estimatedAnnualEnergyCost > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round((bestAnnualSavings / estimatedAnnualEnergyCost) * 100),
          ),
        )
      : 0;

  return {
    annualConsumptionKwh,
    averageMonthlyConsumptionKwh,
    invoiceConsumptionKwh,

    recommendedPowerKwp,

    investmentCost,
    serviceCost,

    annualSavingsInvestment,
    annualSavingsService,

    monthlySavingsInvestment,
    monthlySavingsService,

    dailySavingsInvestment,
    dailySavingsService,

    annualSavings25YearsInvestment,
    annualSavings25YearsService,

    totalSavings25YearsInvestment,
    totalSavings25YearsService,

    estimatedAnnualProductionKwh,
    estimatedMonthlyEnergyCost,
    estimatedAnnualEnergyCost,

    weightedEnergyPriceKwh,

    selfConsumptionRatio,
    viabilityScore,
    paybackYears,

    invoicePriceWithVatKwh,
    surplusCompensationPriceKwh,

    annualSelfConsumedEnergyKwh,
    annualSurplusEnergyKwh,

    annualSelfConsumptionValue,
    annualSurplusValue,
    annualGrossSolarValue,

    annualMaintenanceCost,
    annualServiceFee,

    periodDistribution: distribution,
    periodPercentages: percentages,

    charts: {
      savingsProjectionInvestment: [
        { label: "Día", value: dailySavingsInvestment },
        { label: "Mes", value: monthlySavingsInvestment },
        { label: "Año", value: annualSavingsInvestment },
      ],
      savingsProjectionService: [
        { label: "Día", value: dailySavingsService },
        { label: "Mes", value: monthlySavingsService },
        { label: "Año", value: annualSavingsService },
      ],
      periodDistribution: ALL_PERIODS.filter(
        (period) => percentages[period] > 0,
      ).map((period) => ({
        label: period,
        value: distribution[period],
        percentage: round(percentages[period] * 100, 1),
      })),
    },

    formulaVersion: "3.2.0",
  };
};