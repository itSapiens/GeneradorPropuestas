import { describe, expect, it } from "vitest";

import {
  calculateEnergyStudy,
  type CalculationInput,
} from "./calculateProposal.usecase";

const BASE_INPUT: CalculationInput = {
  monthlyConsumptionKwh: 400,
  billType: "2TD",
  effectiveHours: 1200,
  investmentCostKwh: 1000,
  serviceCostKwh: 0.05,
  selfConsumptionRatio: 0.8,
  surplusCompensationPriceKwh: 0.06,
  maintenanceAnnualPerKwp: 36,
  vatRate: 0.21,
};

describe("calculateEnergyStudy", () => {
  describe("annualSelfConsumedEnergyKwh", () => {
    it("equals recommendedPower * effectiveHours * selfConsumptionRatio", () => {
      const result = calculateEnergyStudy(BASE_INPUT);
      const expected = result.recommendedPowerKwp * BASE_INPUT.effectiveHours * BASE_INPUT.selfConsumptionRatio;
      expect(result.annualSelfConsumedEnergyKwh).toBeCloseTo(expected, 1);
    });

    it("respects selfConsumptionRatio of 1 (no surplus)", () => {
      const result = calculateEnergyStudy({ ...BASE_INPUT, selfConsumptionRatio: 1 });
      expect(result.annualSurplusEnergyKwh).toBe(0);
      expect(result.annualSelfConsumedEnergyKwh).toBe(result.estimatedAnnualProductionKwh);
    });

    it("respects selfConsumptionRatio of 0 (all surplus)", () => {
      const result = calculateEnergyStudy({ ...BASE_INPUT, selfConsumptionRatio: 0 });
      expect(result.annualSelfConsumedEnergyKwh).toBe(0);
      expect(result.annualSurplusEnergyKwh).toBe(result.estimatedAnnualProductionKwh);
    });
  });

  describe("annualSurplusEnergyKwh", () => {
    it("equals estimatedAnnualProduction * (1 - selfConsumptionRatio)", () => {
      const result = calculateEnergyStudy(BASE_INPUT);
      const expected = result.estimatedAnnualProductionKwh * (1 - BASE_INPUT.selfConsumptionRatio);
      expect(result.annualSurplusEnergyKwh).toBeCloseTo(expected, 1);
    });
  });

  describe("annualSavingsInvestment — ahorro neto", () => {
    it("equals grossSolarValue when maintenance is 0", () => {
      const result = calculateEnergyStudy({ ...BASE_INPUT, maintenanceAnnualPerKwp: 0 });
      expect(result.annualSavingsInvestment).toBe(result.annualGrossSolarValue);
    });

    it("subtracts annualMaintenanceCost from gross value", () => {
      const result = calculateEnergyStudy({ ...BASE_INPUT, maintenanceAnnualPerKwp: 50 });
      const expected = Math.max(result.annualGrossSolarValue - result.annualMaintenanceCost, 0);
      expect(result.annualSavingsInvestment).toBeCloseTo(expected, 2);
    });

    it("never goes below 0", () => {
      const result = calculateEnergyStudy({ ...BASE_INPUT, maintenanceAnnualPerKwp: 99999 });
      expect(result.annualSavingsInvestment).toBeGreaterThanOrEqual(0);
    });

    it("gross includes surplus compensation when price > 0", () => {
      const result = calculateEnergyStudy({
        ...BASE_INPUT,
        selfConsumptionRatio: 0.7,
        surplusCompensationPriceKwh: 0.06,
        maintenanceAnnualPerKwp: 0,
      });
      expect(result.annualSurplusValue).toBeGreaterThan(0);
      expect(result.annualGrossSolarValue).toBe(
        result.annualSelfConsumptionValue + result.annualSurplusValue,
      );
    });
  });

  describe("estimatedAnnualProductionKwh", () => {
    it("equals effectiveHours * recommendedPowerKwp", () => {
      const result = calculateEnergyStudy(BASE_INPUT);
      expect(result.estimatedAnnualProductionKwh).toBeCloseTo(
        BASE_INPUT.effectiveHours * result.recommendedPowerKwp,
        1,
      );
    });
  });

  describe("fixed payment", () => {
    it("uses the fixed amount for service and investment", () => {
      const result = calculateEnergyStudy({
        ...BASE_INPUT,
        fixedPaymentAmount: 75,
        paymentMode: "fijo",
      });

      expect(result.annualServiceFee).toBe(900);
      expect(result.serviceCost).toBe(900);
      expect(result.investmentCost).toBe(75);
      expect(result.annualSavingsService).toBeCloseTo(
        Math.max(result.annualGrossSolarValue - 900, 0),
        2,
      );
    });

    it("keeps invoice-based service fee when fixed amount is missing", () => {
      const result = calculateEnergyStudy({
        ...BASE_INPUT,
        fixedPaymentAmount: null,
        paymentMode: "fijo",
      });

      expect(result.annualServiceFee).toBeCloseTo(
        result.annualSelfConsumedEnergyKwh * BASE_INPUT.serviceCostKwh,
        2,
      );
      expect(result.investmentCost).toBe(
        result.recommendedPowerKwp * BASE_INPUT.investmentCostKwh,
      );
    });
  });
});
