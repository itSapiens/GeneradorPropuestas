import type {
  ExtractedBillData,
  ValidationBillData,
} from "@/src/entities/proposal/domain/proposal.types";

export type ManualInvoiceData = ValidationBillData & {
  invoiceVariableEnergyAmountEur?: number;
};

function splitLastName(lastName: string) {
  const parts = lastName.trim().split(/\s+/).filter(Boolean);

  if (parts.length <= 1) {
    return {
      lastname1: lastName.trim() || null,
      lastname2: null,
    };
  }

  return {
    lastname1: parts[0] ?? null,
    lastname2: parts.slice(1).join(" ") || null,
  };
}

export function buildManualExtractionFromData(
  data: ManualInvoiceData,
): ExtractedBillData {
  const { lastname1, lastname2 } = splitLastName(data.lastName);
  const invoiceConsumption =
    data.currentInvoiceConsumptionKwh ??
    data.averageMonthlyConsumptionKwh ??
    data.monthlyConsumption;

  return {
    customer: {
      fullName: `${data.name} ${data.lastName}`.trim(),
      name: data.name,
      lastname1,
      lastname2,
      surnames: data.lastName,
      dni: data.dni,
      cups: data.cups ?? null,
      iban: data.iban ?? null,
      ibanNeedsCompletion: false,
      email: data.email,
      phone: data.phone,
    },
    location: {
      address: data.address,
      street: null,
      postalCode: null,
      city: null,
      province: null,
      country: "España",
    },
    invoice_data: {
      type: data.billType,
      billedDays: data.billedDays ?? null,
      consumptionKwh: invoiceConsumption ?? null,
      currentInvoiceConsumptionKwh: data.currentInvoiceConsumptionKwh ?? null,
      averageMonthlyConsumptionKwh:
        data.averageMonthlyConsumptionKwh ?? data.monthlyConsumption ?? null,
      periods: {
        P1: data.periodConsumptionP1 ?? null,
        P2: data.periodConsumptionP2 ?? null,
        P3: data.periodConsumptionP3 ?? null,
        P4: data.periodConsumptionP4 ?? null,
        P5: data.periodConsumptionP5 ?? null,
        P6: data.periodConsumptionP6 ?? null,
      },
      periodPricesEurPerKwh: {
        P1: data.periodPriceP1 ?? null,
        P2: data.periodPriceP2 ?? null,
        P3: data.periodPriceP3 ?? null,
        P4: data.periodPriceP4 ?? null,
        P5: data.periodPriceP5 ?? null,
        P6: data.periodPriceP6 ?? null,
      },
      postcodeAverageConsumptionKwh: null,
      invoiceVariableEnergyAmountEur:
        data.invoiceVariableEnergyAmountEur ?? null,
      invoiceTotalAmountEur: data.invoiceTotalAmountEur ?? null,
      contractedPowerText: data.contractedPowerText ?? null,
      contractedPowerKw: data.contractedPowerKw ?? null,
      contractedPowerP1: data.contractedPowerP1 ?? null,
      contractedPowerP2: data.contractedPowerP2 ?? null,
    },
    extraction: {
      confidenceScore: 1,
      missingFields: [],
      warnings: ["Datos de factura introducidos manualmente."],
      manualReviewFields: [],
      extractionMethod: "manual",
      fallbackUsed: false,
    },
  };
}
