import { describe, expect, it } from "vitest";

import { buildProposalPdfHtml } from "./proposalPdfHtml";

const billData = {
  address: "Ames, A Coruña",
  billType: "2TD",
  contractedPowerKw: 4.4,
  lastName: "Otero",
  name: "Eliseo C.",
} as any;

const calculationResult = {
  annualConsumptionKwh: 4150,
  annualSelfConsumedEnergyKwh: 3200,
  annualServiceFee: 264,
  estimatedAnnualProductionKwh: 4492,
  estimatedAnnualEnergyCost: 816,
  invoicePriceWithVatKwh: 0.197,
  investmentCost: 4593,
  paybackYears: 7.7,
  recommendedPowerKwp: 3.5,
  totalSavings25YearsInvestment: 21658,
  totalSavings25YearsService: 12050,
  weightedEnergyPriceKwh: 0.165,
} as any;

describe("buildProposalPdfHtml", () => {
  it("renders the proposal without the dark savings block and with the Sapiens stability chart", () => {
    const html = buildProposalPdfHtml({
      billData,
      calculationResult,
      continueContractUrl: "https://app.example.com/continuar",
      language: "es",
      proposals: [
        {
          annualConsumptionKwh: 4150,
          annualMaintenance: 0,
          annualSavings: 330,
          badge: "A",
          companyEmail: "titular@example.com",
          companyName: "Empresa Titular",
          description: "Servicio",
          mode: "service",
          monthlyFee: 22,
          paybackYears: 0,
          recommendedPowerKwp: 3.5,
          title: "Cuota mensual",
          totalSavings25Years: 12050,
          upfrontCost: 0,
        },
        {
          annualConsumptionKwh: 4150,
          annualMaintenance: 0,
          annualSavings: 594,
          badge: "B",
          companyEmail: "titular@example.com",
          companyName: "Empresa Titular",
          description: "Inversión",
          mode: "investment",
          monthlyFee: null,
          paybackYears: 7.7,
          recommendedPowerKwp: 3.5,
          title: "Compra única",
          totalSavings25Years: 21658,
          upfrontCost: 4593,
        },
      ],
    });

    expect(html).toContain(`class="orbs-comparison-grid"`);
    expect(html).toContain(`class="stability-orbit-notes"`);
    expect(html).toContain(`class="proposal-stability-graph"`);
    expect(html).not.toContain("Precio actual factura:");
    expect(html).toContain("orbit-mode-note orbit-note-service");
    expect(html).toContain("orbit-mode-note orbit-note-investment");
    expect(html).toContain("Ahorro anual");
    expect(html).toContain("Ahorro mensual");
    expect(html).toContain("Ahorro a 25 años");
    expect(html).toContain("IVA no incluido");
    expect(html).not.toContain("IVA incluido");
    expect(html).toContain(">Servicio</text>");
    expect(html).toContain(">Inversión</text>");
    expect(html).toContain("* Proyección estimada un IPC del 2% anual.");
    expect(html).toContain("0,083");
    expect(html).toContain("0,057");
    expect(html).not.toContain("486 €/año");
    expect(html).not.toContain("222 €/año");
    expect(html).not.toContain("cost-badge-a");
    expect(html).not.toContain("cost-badge-b");
    expect(html).not.toContain("183,72 €/año");
    expect(html).toContain("Informe · Empresa Titular");
    expect(html).toContain("titular@example.com");
    expect(html).toContain(`href="https://app.example.com/continuar"`);
    expect(html).not.toContain("Informe · Solar Común");
    expect(html).not.toContain("Inversión Compra");
    expect(html).not.toContain("A 12 AÑOS (ACUMULADO)");
    expect(html).not.toContain("A 25 AÑOS (ACUMULADO)");
    expect(html).toContain("8 uds.");
    expect(html).not.toContain(`class="savings-summary-block"`);
    expect(html).not.toContain(`class="annual-savings-strip"`);
    expect(html).not.toContain(`class="modalities-section`);
    expect(html).not.toContain("Elige tu opción");
    expect(html).not.toContain("Precio de tu energía con participación · 25 años");
  });

  it("shows only the available modality when the installation does not support both", () => {
    const html = buildProposalPdfHtml({
      billData,
      calculationResult,
      language: "es",
      proposals: [
        {
          annualConsumptionKwh: 4150,
          annualMaintenance: 0,
          annualSavings: 330,
          badge: "A",
          companyEmail: "titular@example.com",
          companyName: "Empresa Titular",
          description: "Servicio",
          mode: "service",
          monthlyFee: 22,
          paybackYears: 0,
          recommendedPowerKwp: 3.5,
          title: "Cuota mensual",
          totalSavings25Years: 12050,
          upfrontCost: 0,
        },
      ],
    });

    expect(html).toContain("orbs-comparison-grid single-modality-grid single-service-grid");
    expect(html).toContain(">Servicio</text>");
    expect(html).toContain("Ahorro anual");
    expect(html).toContain(`class="destinations-col"`);
    expect(html).toContain(`class="destination-row"`);
    expect(html).not.toContain(`<div class="eyebrow orb-label label-b">`);
    expect(html).not.toContain(`<div class="orb-footer-label footer-label-b">`);
    expect(html).not.toContain("Modalidad disponible");
    expect(html).not.toContain("Tu contratación");
    expect(html).not.toContain("Elige tu opción");
    expect(html).not.toContain(
      `<div class="recommended-badge">RECOMENDADO</div>`,
    );
    expect(html).not.toContain(`<div class="modality-card card-b`);
  });

  it("uses the calculated service monthly amount instead of the template placeholder", () => {
    const html = buildProposalPdfHtml({
      billData,
      calculationResult: {
        ...calculationResult,
        annualServiceFee: 288,
      },
      language: "es",
      proposals: [
        {
          annualConsumptionKwh: 4150,
          annualMaintenance: 0,
          annualSavings: 330,
          badge: "A",
          companyEmail: "titular@example.com",
          companyName: "Empresa Titular",
          description: "Servicio",
          mode: "service",
          monthlyFee: 22,
          paybackYears: 0,
          recommendedPowerKwp: 3.5,
          title: "Cuota mensual",
          totalSavings25Years: 12050,
          upfrontCost: 0,
        },
      ],
    });

    expect(html).toContain("24,00 €/mes");
    expect(html).not.toContain("22€/mes");
  });

  it("localizes key proposal labels based on the selected language", () => {
    const html = buildProposalPdfHtml({
      billData,
      calculationResult,
      language: "gl",
      proposals: [
        {
          annualConsumptionKwh: 4150,
          annualMaintenance: 0,
          annualSavings: 594,
          badge: "B",
          companyEmail: "titular@example.com",
          companyName: "Empresa Titular",
          description: "Inversión",
          mode: "investment",
          monthlyFee: null,
          paybackYears: 7.7,
          recommendedPowerKwp: 3.5,
          title: "Compra",
          totalSavings25Years: 21658,
          upfrontCost: 4593,
        },
      ],
    });

    expect(html).not.toContain("A 12 ANOS (ACUMULADO)");
    expect(html).toContain(">Investimento</text>");
    expect(html).toContain("Aforro anual");
    expect(html).toContain("* Proxección estimada cun IPC do 2% anual.");
    expect(html).toContain("A enerxía, <em>nas túas mans</em> sen tocar o teu tellado.");
    expect(html).toContain("O teu impacto ambiental · 25 anos");
    expect(html).toContain("Reservamos a túa participación?");
    expect(html).not.toContain("Elixe a túa opción");
  });

  it("avoids showing a 0,000 €/kWh circle when the modality uses fixed pricing", () => {
    const html = buildProposalPdfHtml({
      billData,
      calculationResult,
      language: "gl",
      proposals: [
        {
          annualConsumptionKwh: 4150,
          annualMaintenance: 0,
          annualSavings: 286,
          badge: "B",
          companyEmail: "titular@example.com",
          companyName: "Empresa Titular",
          description: "Investimento",
          energyPriceKwh: null,
          mode: "investment",
          monthlyFee: null,
          paybackYears: 0.1,
          recommendedPowerKwp: 3,
          title: "Investimento",
          totalSavings25Years: 10435,
          upfrontCost: 15,
        },
      ],
    });

    expect(html).not.toContain("0,000");
    expect(html).toContain("15,00 €");
    expect(html).toContain("pagamento único");
    expect(html).toContain(">Investimento</text>");
    expect(html).toContain("Aforro a 25 anos");
  });
});
