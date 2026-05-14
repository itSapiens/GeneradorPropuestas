import { describe, expect, it } from "vitest";

import { buildProposalPdfSummariesForInstallation } from "./proposalPdf";
import type { ApiInstallation } from "@/src/entities/proposal/domain/proposal.types";

const t = ((key: string) => key) as any;

describe("buildProposalPdfSummariesForInstallation", () => {
  it("includes installation data in every proposal summary", () => {
    const installation: ApiInstallation = {
      active: true,
      almacenamiento_kwh: 0,
      coste_anual_mantenimiento_por_kwp: 36,
      coste_kwh_inversion: 0.19,
      coste_kwh_servicio: 0.05,
      direccion: "Calle Solar 123, Valencia",
      horas_efectivas: 1253,
      id: "inst-1",
      lat: 39.4699,
      lng: -0.3763,
      modalidad: "ambas",
      nombre_instalacion: "Cubierta Sapiens",
      porcentaje_autoconsumo: 80,
      potencia_instalada_kwp: 50,
    };

    const result = {
      annualConsumptionKwh: 3761,
      annualMaintenanceCost: 126,
      annualSavingsInvestment: 601.37,
      annualSavingsService: 446.7,
      paybackYears: 10,
      recommendedPowerKwp: 3.5,
      serviceCost: 287.16,
      totalSavings25YearsInvestment: 15034.25,
      totalSavings25YearsService: 11167.5,
    } as any;

    const summaries = buildProposalPdfSummariesForInstallation(
      result,
      installation,
      t,
    );

    expect(summaries).toHaveLength(2);

    for (const summary of summaries) {
      expect(summary.installationName).toBe("Cubierta Sapiens");
      expect(summary.installationAddress).toBe("Calle Solar 123, Valencia");
    }
  });

  it("includes company PDF branding fields in every proposal summary", () => {
    const installation: ApiInstallation = {
      active: true,
      almacenamiento_kwh: 0,
      coste_anual_mantenimiento_por_kwp: 36,
      coste_kwh_inversion: 0.19,
      coste_kwh_servicio: 0.05,
      direccion: "Calle Solar 123, Valencia",
      empresa: {
        email: "hola@marca.test",
        logo_bucket: "empresa-logos",
        logo_mime_type: "image/png",
        logo_path: "empresa-1/logo.png",
        nombre: "Marca Solar",
        pdf_color_acento: "#12AA99",
        pdf_color_fondo_card: "#FAFCFF",
        pdf_color_fondo_pagina: "#F1F7F4",
        pdf_color_primario: "#111111",
        pdf_color_secundario: "#3366FF",
        pdf_color_texto: "#222222",
        pdf_frase_destacada: "en tus manos",
        pdf_frase_final: "sin tocar tu tejado.",
        pdf_frase_inicio: "La energía,",
        telefono: "900 100 100",
      },
      horas_efectivas: 1253,
      id: "inst-1",
      lat: 39.4699,
      lng: -0.3763,
      modalidad: "servicio",
      nombre_instalacion: "Cubierta Sapiens",
      porcentaje_autoconsumo: 80,
      potencia_instalada_kwp: 50,
    };

    const [summary] = buildProposalPdfSummariesForInstallation(
      {
        annualConsumptionKwh: 3761,
        annualServiceFee: 960,
        annualSavingsService: 446.7,
        recommendedPowerKwp: 3.5,
        serviceCost: 960,
        totalSavings25YearsService: 11167.5,
      } as any,
      installation,
      t,
    );

    expect(summary.companyName).toBe("Marca Solar");
    expect(summary.companyLogoBucket).toBe("empresa-logos");
    expect(summary.companyLogoPath).toBe("empresa-1/logo.png");
    expect(summary.companyPdfColorAcento).toBe("#12AA99");
    expect(summary.companyPdfColorFondoCard).toBe("#FAFCFF");
    expect(summary.companyPdfColorFondoPagina).toBe("#F1F7F4");
    expect(summary.companyPdfFraseDestacada).toBe("en tus manos");
  });

  it("shows maintenance only for investment summaries", () => {
    const installation: ApiInstallation = {
      active: true,
      almacenamiento_kwh: 0,
      coste_anual_mantenimiento_por_kwp: 36,
      coste_kwh_inversion: 0.19,
      coste_kwh_servicio: 0.05,
      direccion: "Calle Solar 123, Valencia",
      horas_efectivas: 1253,
      id: "inst-1",
      lat: 39.4699,
      lng: -0.3763,
      modalidad: "ambas",
      nombre_instalacion: "Cubierta Sapiens",
      porcentaje_autoconsumo: 80,
      potencia_instalada_kwp: 50,
    };

    const result = {
      annualConsumptionKwh: 3761,
      annualMaintenanceCost: 126,
      annualSavingsInvestment: 601.37,
      annualSavingsService: 446.7,
      paybackYears: 10,
      recommendedPowerKwp: 3.5,
      serviceCost: 287.16,
      totalSavings25YearsInvestment: 15034.25,
      totalSavings25YearsService: 11167.5,
    } as any;

    const summaries = buildProposalPdfSummariesForInstallation(
      result,
      installation,
      t,
    );

    const investment = summaries.find((summary) => summary.mode === "investment");
    const service = summaries.find((summary) => summary.mode === "service");

    expect(investment?.annualMaintenance).toBe(126);
    expect(service?.annualMaintenance).toBe(0);
  });

  it("lets the PDF derive service energy price from the fixed monthly fee", () => {
    const installation: ApiInstallation = {
      active: true,
      almacenamiento_kwh: 0,
      cantidad_precio_fijo: 80,
      coste_anual_mantenimiento_por_kwp: 36,
      coste_kwh_inversion: 0.19,
      coste_kwh_servicio: 0.05,
      direccion: "Calle Solar 123, Valencia",
      horas_efectivas: 1253,
      id: "inst-1",
      lat: 39.4699,
      lng: -0.3763,
      modalidad: "servicio",
      nombre_instalacion: "Cubierta Sapiens",
      pago: "fijo",
      porcentaje_autoconsumo: 80,
      potencia_instalada_kwp: 50,
    };

    const result = {
      annualConsumptionKwh: 3761,
      annualServiceFee: 960,
      annualSavingsService: 446.7,
      recommendedPowerKwp: 3.5,
      serviceCost: 960,
      totalSavings25YearsService: 11167.5,
    } as any;

    const [summary] = buildProposalPdfSummariesForInstallation(
      result,
      installation,
      t,
    );

    expect(summary.energyPriceKwh).toBeNull();
    expect(summary.monthlyFee).toBe(80);
  });

  it("lets the PDF derive investment energy price from the fixed amount", () => {
    const installation: ApiInstallation = {
      active: true,
      almacenamiento_kwh: 0,
      cantidad_precio_fijo: 4200,
      coste_anual_mantenimiento_por_kwp: 36,
      coste_kwh_inversion: 0.19,
      coste_kwh_servicio: 0.05,
      direccion: "Calle Solar 123, Valencia",
      horas_efectivas: 1253,
      id: "inst-1",
      lat: 39.4699,
      lng: -0.3763,
      modalidad: "inversion",
      nombre_instalacion: "Cubierta Sapiens",
      pago: "fijo",
      porcentaje_autoconsumo: 80,
      potencia_instalada_kwp: 50,
    };

    const result = {
      annualConsumptionKwh: 3761,
      annualMaintenanceCost: 126,
      annualSavingsInvestment: 601.37,
      investmentCost: 4200,
      paybackYears: 7,
      recommendedPowerKwp: 3.5,
      totalSavings25YearsInvestment: 15034.25,
    } as any;

    const [summary] = buildProposalPdfSummariesForInstallation(
      result,
      installation,
      t,
    );

    expect(summary.energyPriceKwh).toBeNull();
    expect(summary.upfrontCost).toBe(4200);
  });
});
