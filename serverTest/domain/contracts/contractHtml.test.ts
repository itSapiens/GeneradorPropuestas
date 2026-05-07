import { describe, expect, it } from "vitest";
import { buildBasicContractHtml } from "./contractHtml";
import { buildSignedContractPdfHtml } from "./signedContractPdfHtml";
import type { ContractCommercialSummary } from "./contractCommercial";

const baseCommercial: ContractCommercialSummary = {
  annualMaintenance: 258,
  availableModes: ["investment", "service"],
  investmentPrice: 5625,
  reservationAmount: 500,
  reservationMode: "fija",
  selectedMode: "investment",
  selectedPrice: 5625,
  selectedPriceUnit: "one_time",
  serviceMonthlyFee: 24,
};

const baseClient = {
  apellidos: "Vives Jose",
  direccion_completa: "Puerta del Sol",
  dni: "46735893P",
  email: "cliente@example.com",
  nombre: "Xavier",
  telefono: "722491265",
};

const baseInstallation = {
  direccion: "Puerta del Sol, 1, 28013 Madrid",
  empresa: {
    cif: "G22784938",
    nombre: "ASSOC AUTOCONSUM ENERGIES RENOV BATOI",
  },
  iban_aportaciones: "ES0000000000000000000000",
  nombre_instalacion: "Instalacion Test Madrid - Puerta del Sol",
};

describe("contract html mode rendering", () => {
  it("renders only the selected investment price in contract previews", () => {
    const html = buildBasicContractHtml({
      assignedKwp: 3,
      client: baseClient,
      commercial: baseCommercial,
      contractId: "contract-1",
      contractNumber: "CT-TEST",
      installation: baseInstallation,
      language: "es",
      proposalMode: "investment",
      study: {},
    });

    expect(html).toContain("Precio inversión");
    expect(html).toContain("5625");
    expect(html).not.toContain("Precio servicio");
    expect(html).not.toContain("Modalidades disponibles");
  });

  it("renders only the selected service price in signed contract PDFs", () => {
    const commercial: ContractCommercialSummary = {
      ...baseCommercial,
      selectedMode: "service",
      selectedPrice: 24,
      selectedPriceUnit: "monthly",
    };

    const html = buildSignedContractPdfHtml({
      language: "es",
      preview: {
        assignedKwp: 3,
        client: baseClient,
        commercial,
        contractNumber: "CT-TEST",
        installation: baseInstallation,
        proposalMode: "service",
      },
      signatureDataUrl:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    });

    expect(html).toContain("Precio servicio");
    expect(html).toContain("24");
    expect(html).not.toContain("Precio inversión");
    expect(html).not.toContain("Modalidades disponibles");
  });
});
