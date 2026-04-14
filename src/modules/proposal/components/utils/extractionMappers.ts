import { ExtractedBillData } from "@/src/services/geminiService";
import { ValidationBillData } from "../types/proposal.types";
import { buildLastName, getPositiveFiniteNumber, isBillType, normalizeAndRoundUp } from "./proposalNumbers";
import { ExtraConsumptionSelections } from "@/src/components/shared/ExtraConsumptionModal";
import { BillData } from "@/src/lib/validators";
import { sileo } from "sileo";
import { formatNumber } from "@/src/lib/utils";
import { TFunction } from "i18next";

export function buildPeriodPricesFromValidatedData(validatedData: ValidationBillData) {
  return {
    P1: validatedData.periodPriceP1,
    P2: validatedData.periodPriceP2,
    P3: validatedData.periodPriceP3,
    P4: validatedData.periodPriceP4,
    P5: validatedData.periodPriceP5,
    P6: validatedData.periodPriceP6,
  };
}



function buildPeriodConsumptionsFromValidatedData(
  validatedData: ValidationBillData,
) {
  return {
    P1: validatedData.periodConsumptionP1,
    P2: validatedData.periodConsumptionP2,
    P3: validatedData.periodConsumptionP3,
    P4: validatedData.periodConsumptionP4,
    P5: validatedData.periodConsumptionP5,
    P6: validatedData.periodConsumptionP6,
  };
}


function getInvoiceVariableEnergyAmountFromExtraction(
  extraction: ExtractedBillData | null,
): number | undefined {
  const invoiceData = extraction?.invoice_data as
    | Record<string, unknown>
    | undefined;

  if (!invoiceData) return undefined;

  const candidateKeys = [
    "invoiceVariableEnergyAmountEur",
    "variableEnergyAmountEur",
    "energyTermAmountEur",
    "variableTermAmountEur",
    "totalVariableEnergyAmountEur",
    "importeEnergiaConsumidaEur",
    "costeEnergiaEur",
    "costOfEnergyEur",
    "energyCostEur",
  ];

  for (const key of candidateKeys) {
    const value = getPositiveFiniteNumber(invoiceData[key]);
    if (value !== undefined) return value;
  }

  return undefined;
}

function mapExtractedToBillData(
  data: ExtractedBillData,
): Partial<ValidationBillData> {
  const fullLastName = buildLastName(
    data.customer.lastname1,
    data.customer.lastname2,
  );

  const rawBillType = data.invoice_data.type;
  const safeBillType = isBillType(rawBillType) ? rawBillType : undefined;

  const invoiceDataAny = data.invoice_data as any;

  const contractedPowerTextRaw =
    invoiceDataAny?.contractedPowerText ??
    invoiceDataAny?.potenciaContratadaTexto ??
    invoiceDataAny?.potenciasContratadasTexto ??
    invoiceDataAny?.contractedPowersText ??
    null;

  const contractedPowerP1Raw =
    invoiceDataAny?.contractedPowerP1 ??
    invoiceDataAny?.contractedPowerP1Kw ??
    invoiceDataAny?.potenciaContratadaP1 ??
    invoiceDataAny?.potenciaContratadaPuntaLlano ??
    invoiceDataAny?.potenciaContratadaPuntaLlanoKw ??
    invoiceDataAny?.puntaLlanoKw ??
    invoiceDataAny?.peakFlatKw ??
    invoiceDataAny?.contractedPowers?.punta_llano ??
    invoiceDataAny?.contractedPowers?.puntaLlano ??
    invoiceDataAny?.contractedPowers?.P1 ??
    null;

  const contractedPowerP2Raw =
    invoiceDataAny?.contractedPowerP2 ??
    invoiceDataAny?.contractedPowerP2Kw ??
    invoiceDataAny?.potenciaContratadaP2 ??
    invoiceDataAny?.potenciaContratadaValle ??
    invoiceDataAny?.potenciaContratadaValleKw ??
    invoiceDataAny?.valleKw ??
    invoiceDataAny?.valleyKw ??
    invoiceDataAny?.contractedPowers?.valle ??
    invoiceDataAny?.contractedPowers?.P2 ??
    null;

  const contractedPowerKwRaw =
    invoiceDataAny?.contractedPowerKw ??
    invoiceDataAny?.potenciaContratadaKw ??
    (normalizeAndRoundUp(contractedPowerP1Raw, 2) ===
    normalizeAndRoundUp(contractedPowerP2Raw, 2)
      ? normalizeAndRoundUp(contractedPowerP1Raw, 2)
      : null);

  return {
    name: data.customer.name ?? "",
    lastName: fullLastName,
    dni: data.customer.dni ?? "",
    cups: data.customer.cups ?? "",
    address: data.location.address ?? "",
    email: data.customer.email ?? "",
    phone: data.customer.phone ?? "",
    iban: data.customer.iban ?? "",
    ibanMasked: data.customer.iban ?? "",

    billType: safeBillType,

    monthlyConsumption: normalizeAndRoundUp(
      data.invoice_data.averageMonthlyConsumptionKwh ??
        data.invoice_data.currentInvoiceConsumptionKwh ??
        data.invoice_data.consumptionKwh,
      2,
    ),

    currentInvoiceConsumptionKwh: normalizeAndRoundUp(
      data.invoice_data.currentInvoiceConsumptionKwh ??
        data.invoice_data.consumptionKwh,
      2,
    ),

    averageMonthlyConsumptionKwh: normalizeAndRoundUp(
      data.invoice_data.averageMonthlyConsumptionKwh,
      2,
    ),

    periodConsumptionP1: normalizeAndRoundUp(data.invoice_data.periods?.P1, 2),
    periodConsumptionP2: normalizeAndRoundUp(data.invoice_data.periods?.P2, 2),
    periodConsumptionP3: normalizeAndRoundUp(data.invoice_data.periods?.P3, 2),
    periodConsumptionP4: normalizeAndRoundUp(data.invoice_data.periods?.P4, 2),
    periodConsumptionP5: normalizeAndRoundUp(data.invoice_data.periods?.P5, 2),
    periodConsumptionP6: normalizeAndRoundUp(data.invoice_data.periods?.P6, 2),

    periodPriceP1: normalizeAndRoundUp(
      data.invoice_data.periodPricesEurPerKwh?.P1,
      5,
    ),
    periodPriceP2: normalizeAndRoundUp(
      data.invoice_data.periodPricesEurPerKwh?.P2,
      5,
    ),
    periodPriceP3: normalizeAndRoundUp(
      data.invoice_data.periodPricesEurPerKwh?.P3,
      5,
    ),
    periodPriceP4: normalizeAndRoundUp(
      data.invoice_data.periodPricesEurPerKwh?.P4,
      5,
    ),
    periodPriceP5: normalizeAndRoundUp(
      data.invoice_data.periodPricesEurPerKwh?.P5,
      5,
    ),
    periodPriceP6: normalizeAndRoundUp(
      data.invoice_data.periodPricesEurPerKwh?.P6,
      5,
    ),

    contractedPowerText:
      contractedPowerTextRaw ??
      (normalizeAndRoundUp(contractedPowerP1Raw, 2) &&
      normalizeAndRoundUp(contractedPowerP2Raw, 2)
        ? `Punta-llano: ${formatNumber(normalizeAndRoundUp(contractedPowerP1Raw, 2) ?? 0, 2)} kW · Valle: ${formatNumber(normalizeAndRoundUp(contractedPowerP2Raw, 2) ?? 0, 2)} kW`
        : undefined),

    contractedPowerKw: normalizeAndRoundUp(contractedPowerKwRaw, 2),
    contractedPowerP1: normalizeAndRoundUp(contractedPowerP1Raw, 2),
    contractedPowerP2: normalizeAndRoundUp(contractedPowerP2Raw, 2),
  };
}


function toBaseBillData(
  data: Partial<ValidationBillData>,
  extra?: ExtraConsumptionSelections,
): BillData {
  return {
    name: data.name ?? "",
    lastName: data.lastName ?? "",
    dni: data.dni ?? "",
    cups: data.cups ?? "",
    address: data.address ?? "",
    email: data.email ?? "",
    phone: data.phone ?? "",
    monthlyConsumption:
      data.averageMonthlyConsumptionKwh ?? data.monthlyConsumption ?? 0,
    billType: (data.billType ?? "2TD") as BillData["billType"],
    iban: data.iban ?? "",

    contractedPowerText: data.contractedPowerText,
    contractedPowerKw: data.contractedPowerKw,
    contractedPowerP1: data.contractedPowerP1,
    contractedPowerP2: data.contractedPowerP2,
    ibanMasked: data.ibanMasked,

    // Previsión de incremento de consumo (para el PDF)
    extraConsumptionHvacM2:
      extra?.hvac && extra.hvacSquareMeters ? extra.hvacSquareMeters : undefined,
    extraConsumptionEvKmYear:
      extra?.ev && extra.evAnnualKm ? extra.evAnnualKm : undefined,
  };
}


function shouldHideFromValidation(field: string): boolean {
  const normalized = field.toLowerCase();

  return [
    "iban",
    "cups",
    "currentinvoiceconsumptionkwh",
    "averagemonthlyconsumptionkwh",
    "consumptionkwh",
    "periodconsumption",
    "periodprice",
    "periods",
    "periodpriceseurperkwh",
    "p1",
    "p2",
    "p3",
    "p4",
    "p5",
    "p6",
  ].some((token) => normalized.includes(token));
}


function showExtractionToasts(extraction: ExtractedBillData, t: TFunction) {
  // Mostramos como máximo UN toast informativo de resumen, para no
  // saturar al usuario con una cascada. Si no hay nada relevante que
  // comunicar, no mostramos nada (el sileo.promise ya lanza el "éxito").

  const visibleWarnings = (extraction.extraction.warnings ?? []).filter(
    (warning) => !shouldHideFromValidation(warning),
  );

  const visibleManualReviewFields = (
    extraction.extraction.manualReviewFields ?? []
  ).filter((field) => !shouldHideFromValidation(field));

  const visibleMissingFields = (
    extraction.extraction.missingFields ?? []
  ).filter((field) => !shouldHideFromValidation(field));

  const hasManualReview = visibleManualReviewFields.length > 0;
  const hasMissing = visibleMissingFields.length > 0;
  const hasWarnings = visibleWarnings.length > 0;

  if (!hasManualReview && !hasMissing && !hasWarnings) {
    return;
  }

  // Construimos una única descripción combinada con lo más importante.
  const parts: string[] = [];

  if (hasManualReview) {
    const fields = visibleManualReviewFields.slice(0, 4).join(", ");
    parts.push(
      t(
        "toasts.extraction.manualReviewDescription",
        "Revisa manualmente: {{fields}}",
        { fields },
      ),
    );
  }

  if (hasMissing) {
    parts.push(
      t(
        "toasts.extraction.missingFieldsDescription",
        "{{count}} campo(s) sin detectar.",
        { count: visibleMissingFields.length },
      ),
    );
  }

  if (hasWarnings) {
    parts.push(visibleWarnings[0]!);
  }

  const title = hasManualReview
    ? t(
        "toasts.extraction.manualReviewTitle",
        "Revisa los datos detectados",
      )
    : t("toasts.extraction.warningTitle", "Datos extraídos con avisos");

  const description = parts.join(" · ");

  if (hasManualReview) {
    sileo.error({ title, description });
  } else {
    sileo.info({ title, description });
  }
}









