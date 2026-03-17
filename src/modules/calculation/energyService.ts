import { ENERGY_CONSTANTS } from "../../lib/constants";

export interface CalculationInput {
  monthlyConsumptionKwh: number;
  billType: "2TD" | "3TD";
  effectiveHours: number;
  investmentCostKwh: number;
  serviceCostKwh: number;
  selfConsumptionRatio: number;
}

export interface CalculationResult {
  annualConsumptionKwh: number;
  recommendedPowerKwp: number;
  investmentCost: number;
  serviceCost: number;
  annualSavingsInvestment: number;
  annualSavingsService: number;
  formulaVersion: string;
}

/**
 * Módulo de cálculo energético desacoplado.
 * Implementa las fórmulas definidas para el estudio.
 */
export const calculateEnergyStudy = (input: CalculationInput): CalculationResult => {
  const {
    monthlyConsumptionKwh,
    effectiveHours,
    investmentCostKwh,
    serviceCostKwh,
    selfConsumptionRatio,
  } = input;

  // 1. Consumo anual
  const annualConsumptionKwh = monthlyConsumptionKwh * 12;

  // 2. Potencia recomendada kWp
  // Fórmula: consumo anual / horas efectivas
  // Redondear siempre hacia arriba en escalones de 0,5 kWp
  let rawPower = annualConsumptionKwh / effectiveHours;
  const recommendedPowerKwp = Math.ceil(rawPower * 2) / 2;

  // 3. Inversión €
  // Fórmula: potencia recomendada x coste kWh inversión
  const investmentCost = recommendedPowerKwp * investmentCostKwh;

  // 4. Servicio €
  // Fórmula: potencia recomendada x coste kWh servicio
  const serviceCost = recommendedPowerKwp * serviceCostKwh;

  // 5. Ahorro €
  // Fórmula: horas efectivas x potencia recomendada x % autoconsumo x coste
  const annualSavingsInvestment = effectiveHours * recommendedPowerKwp * selfConsumptionRatio * investmentCostKwh;
  const annualSavingsService = effectiveHours * recommendedPowerKwp * selfConsumptionRatio * serviceCostKwh;

  return {
    annualConsumptionKwh,
    recommendedPowerKwp,
    investmentCost,
    serviceCost,
    annualSavingsInvestment,
    annualSavingsService,
    formulaVersion: "1.0.0",
  };
};
