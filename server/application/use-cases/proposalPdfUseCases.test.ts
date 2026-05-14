import { describe, expect, it, vi } from "vitest";

import { translateCompanyPdfPhrasesForLanguage } from "./proposalPdfUseCases";
import type { ProposalPdfSummary } from "../../../src/entities/proposal/domain/proposalPdf.types";

const baseProposal: ProposalPdfSummary = {
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
};

describe("translateCompanyPdfPhrasesForLanguage", () => {
  it("translates custom company PDF title fragments to the selected language", async () => {
    const translator = vi.fn(async () => [
      "Això és",
      "una prova",
      "del model",
    ]);

    const [proposal] = await translateCompanyPdfPhrasesForLanguage(
      [
        {
          ...baseProposal,
          companyPdfFraseDestacada: "una prueba",
          companyPdfFraseFinal: "de el modelo",
          companyPdfFraseInicio: "Esto es",
        },
      ],
      "ca",
      translator,
    );

    expect(translator).toHaveBeenCalledWith(
      ["Esto es", "una prueba", "de el modelo"],
      "ca",
    );
    expect(proposal.companyPdfFraseInicio).toBe("Això és");
    expect(proposal.companyPdfFraseDestacada).toBe("una prova");
    expect(proposal.companyPdfFraseFinal).toBe("del model");
  });

  it("keeps the standard title on the i18n path", async () => {
    const translator = vi.fn();

    const [proposal] = await translateCompanyPdfPhrasesForLanguage(
      [
        {
          ...baseProposal,
          companyPdfFraseDestacada: "en tus manos",
          companyPdfFraseFinal: "sin tocar tu tejado.",
          companyPdfFraseInicio: "La energía,",
        },
      ],
      "gl",
      translator,
    );

    expect(translator).not.toHaveBeenCalled();
    expect(proposal.companyPdfFraseInicio).toBe("La energía,");
    expect(proposal.companyPdfFraseDestacada).toBe("en tus manos");
    expect(proposal.companyPdfFraseFinal).toBe("sin tocar tu tejado.");
  });
});
