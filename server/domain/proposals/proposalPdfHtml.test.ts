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
    expect(html).toContain(`class="stability-orbit-notes orbit-savings-layer"`);
    expect(html).toContain(`class="proposal-stability-graph"`);
    expect(html).not.toContain("Precio actual factura:");
    expect(html).toContain("orbit-savings orbit-savings-service");
    expect(html).toContain("orbit-savings orbit-savings-investment");
    expect(html).not.toContain("orbit-mode-note");
    expect(html).toContain("Ahorro anual");
    expect(html).toContain("Ahorro mensual");
    expect(html).toContain("Ahorro a 25 años");
    expect(html).toContain("Potencia punta: 4,4 kW · Potencia valle: 4,4 kW");
    expect(html).toContain("más barato en horas solares");
    expect(html).toContain("Coste del kWh en horas solares durante la vida útil de la instalación");
    expect(html).toContain(
      `<div class="orbit-saving-label orbit-saving-total"><span>Ahorro a 25 años</span><strong>21.658,00 €</strong></div>`,
    );
    expect(html).not.toContain(
      `<div class="orbit-saving-label orbit-saving-total"><span>Ahorro a 25 años</span><strong>4.593,00 €</strong></div>`,
    );
    expect(html).toContain("IVA no incluido");
    expect(html).not.toContain("IVA incluido");
    expect(html).toContain(">Servicio</span>");
    expect(html).toContain(">Inversión</span>");
    expect(html).toContain("* Proyección estimada un IPC del 2% anual.");
    expect(html).toContain("0,083");
    expect(html).toContain("0,057");
    expect(html).not.toContain("486 €/año");
    expect(html).not.toContain("222 €/año");
    expect(html).toContain("cost-badge-a");
    expect(html).toContain("cost-badge-b");
    expect(html).toContain("264,00 €/año");
    expect(html).toContain("183,72 €/año");
    expect(html).toContain("Informe · Empresa Titular");
    expect(html).toContain("titular@example.com");
    expect(html).toContain(`href="https://app.example.com/continuar"`);
    expect(html).toContain(
      `<a class="cta-button" href="https://app.example.com/continuar"`,
    );
    expect(html).not.toContain(`<div class="cta-button">Reservar`);
    expect(html).not.toContain("Informe · Solar Común");
    expect(html).not.toContain("Inversión Compra");
    expect(html).not.toContain("A 12 AÑOS (ACUMULADO)");
    expect(html).not.toContain("A 25 AÑOS (ACUMULADO)");
    expect(html).toMatch(/8 (uds\.|unidades\.)/);
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
    expect(html).toContain(">Servicio</span>");
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

  it("normalizes contracted power text to one decimal in the tariff summary", () => {
    const html = buildProposalPdfHtml({
      billData: {
        ...billData,
        contractedPowerKw: undefined,
        contractedPowerP1: undefined,
        contractedPowerP2: undefined,
        contractedPowerText: "punta-llano 5,500 kW; valle 3,000 kW",
      },
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

    expect(html).toContain("2.0TD · Potencia punta: 5,5 kW · Potencia valle: 3,0 kW");
    expect(html).not.toContain("5,500 kW");
    expect(html).not.toContain("3,000 kW");
  });

  it("uses the 3.0TD label when the bill type is 3TD", () => {
    const html = buildProposalPdfHtml({
      billData: {
        ...billData,
        billType: "3TD",
        contractedPowerP1: 12.34,
        contractedPowerP2: 8.76,
      },
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

    expect(html).toContain("3.0TD · Potencia punta: 12,3 kW · Potencia valle: 8,8 kW");
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
    expect(html).toContain(">Investimento</span>");
    expect(html).toContain("Aforro anual");
    expect(html).toContain("* Proxección estimada cun IPC do 2% anual.");
    expect(html).toContain("A enerxía, <em>nas túas mans</em> sen tocar o teu tellado.");
    expect(html).toContain("O teu impacto ambiental · 25 anos");
    expect(html).toContain("Reservamos a túa participación?");
    expect(html).toContain("máis barato en horas solares");
    expect(html).toContain("Custo do kWh en horas solares durante a vida útil da instalación");
    expect(html).not.toContain("Elixe a túa opción");
  });

  it("applies company branding, logo and the localized configurable cover phrase", () => {
    const html = buildProposalPdfHtml({
      billData,
      calculationResult,
      companyLogoDataUri: "data:image/png;base64,ZmFrZS1sb2dv",
      language: "ca",
      proposals: [
        {
          annualConsumptionKwh: 4150,
          annualMaintenance: 0,
          annualSavings: 330,
          badge: "A",
          companyEmail: "marca@example.com",
          companyLogoPath: "empresa-1/logo.png",
          companyName: "Marca Solar",
          companyPdfColorAcento: "#12AA99",
          companyPdfColorFondoCard: "#FAFCFF",
          companyPdfColorFondoPagina: "#F1F7F4",
          companyPdfColorPrimario: "#111111",
          companyPdfColorSecundario: "#3366FF",
          companyPdfColorTexto: "#222222",
          companyPdfFraseDestacada: "en tus manos",
          companyPdfFraseFinal: "sin tocar tu tejado.",
          companyPdfFraseInicio: "La energía,",
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

    expect(html).toContain(`style="--text-main:#222222;`);
    expect(html).toContain(`--brand-primary:#111111;`);
    expect(html).toContain(`--brand-blue:#3366FF;`);
    expect(html).toContain(`--brand-mint:#12AA99;`);
    expect(html).toContain(`--bg-page:#F1F7F4;`);
    expect(html).toContain(`--bg-card:#FAFCFF;`);
    expect(html).toContain(`--brand-accent-soft:rgba(18,170,153,0.14);`);
    expect(html).toContain(`--brand-secondary-border:rgba(51,102,255,0.3);`);
    expect(html).toContain(`<img class="company-logo" src="data:image/png;base64,ZmFrZS1sb2dv" alt="Marca Solar" />`);
    expect(html).toContain(`<span class="company-name">Marca Solar</span>`);
    expect(html).toContain("L'energia, <em>a les teues mans</em> sense tocar la teua teulada.");
    expect(html).not.toContain("La energía, <em>en tus manos</em> sin tocar tu tejado.");
  });

  it("shows selected extra consumption in the proposal cover", () => {
    const html = buildProposalPdfHtml({
      billData: {
        ...billData,
        extraConsumptionEvKmYear: 12000,
        extraConsumptionHvacM2: 90,
      },
      calculationResult,
      language: "es",
      proposals: [
        {
          annualConsumptionKwh: 4150,
          annualMaintenance: 0,
          annualSavings: 330,
          badge: "A",
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

    expect(html).toContain("Consumo extra");
    expect(html).not.toContain("Consumo extra incluido");
    expect(html).toContain("Climatización");
    expect(html).toContain("90 m²");
    expect(html).toContain("Vehículo eléctrico");
    expect(html).toContain("12.000 km/año");
  });

  it("does not create unselected extra consumption pills from generic annual consumption fields", () => {
    const html = buildProposalPdfHtml({
      billData,
      calculationResult: {
        ...calculationResult,
        annualConsumptionKwh: 9999,
      },
      language: "es",
      proposals: [
        {
          annualConsumptionKwh: 4150,
          annualMaintenance: 0,
          annualSavings: 330,
          badge: "A",
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

    expect(html).not.toContain(`<div class="extra-consumption-pill`);
    expect(html).not.toContain("Climatización");
    expect(html).not.toContain("Vehículo eléctrico");
  });

  it("shows only the selected extra consumption option", () => {
    const html = buildProposalPdfHtml({
      billData: {
        ...billData,
        extraConsumptionEvKmYear: 15000,
      },
      calculationResult,
      language: "es",
      proposals: [
        {
          annualConsumptionKwh: 4150,
          annualMaintenance: 0,
          annualSavings: 330,
          badge: "A",
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

    expect(html).toContain("Consumo extra");
    expect(html).toContain("Vehículo eléctrico");
    expect(html).toContain("15.000 km/año");
    expect(html).not.toContain("Climatización");
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
    expect(html).toContain("orbit-savings orbit-savings-investment");
    expect(html).toContain("Aforro a 25 anos");
  });
});
