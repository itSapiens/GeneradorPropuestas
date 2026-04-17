import {
  type ExtraConsumptionSelections,
  calculateExtraMonthlyConsumption,
} from "@/src/components/shared/ExtraConsumptionModal";
import type { ExtractedBillData } from "@/src/services/geminiService";
import type { ValidationBillData } from "../types/proposal.types";

interface BuildStudyPersistencePayloadsParams {
  validatedData: ValidationBillData;
  rawExtraction: ExtractedBillData | null;
  extraConsumption: ExtraConsumptionSelections;
  clientCoordinates: { lat: number; lng: number } | null;
}

export function buildStudyPersistencePayloads({
  validatedData,
  rawExtraction,
  extraConsumption,
  clientCoordinates,
}: BuildStudyPersistencePayloadsParams) {
  const extractedLocation = (rawExtraction?.location ?? {}) as Record<
    string,
    any
  >;

  const customerPayload = {
    nombre: validatedData.name,
    apellidos: validatedData.lastName,
    dni: validatedData.dni,
    cups: validatedData.cups,
    direccion_completa: validatedData.address,
    email: validatedData.email,
    telefono: validatedData.phone,
    phone: validatedData.phone,
    iban: validatedData.iban,
    codigo_postal:
      extractedLocation.codigo_postal ??
      extractedLocation.codigoPostal ??
      extractedLocation.postalCode ??
      null,
    poblacion:
      extractedLocation.poblacion ??
      extractedLocation.ciudad ??
      extractedLocation.localidad ??
      extractedLocation.city ??
      null,
    provincia: extractedLocation.provincia ?? extractedLocation.state ?? null,
    pais: extractedLocation.pais ?? extractedLocation.country ?? "España",
    tipo_factura: validatedData.billType,
    consumo_mensual_real_kwh: validatedData.currentInvoiceConsumptionKwh,
    consumo_medio_mensual_kwh: validatedData.averageMonthlyConsumptionKwh,
    precio_p1_eur_kwh: validatedData.periodPriceP1 ?? null,
    precio_p2_eur_kwh: validatedData.periodPriceP2 ?? null,
    precio_p3_eur_kwh: validatedData.periodPriceP3 ?? null,
    precio_p4_eur_kwh: validatedData.periodPriceP4 ?? null,
    precio_p5_eur_kwh: validatedData.periodPriceP5 ?? null,
    precio_p6_eur_kwh: validatedData.periodPriceP6 ?? null,
  };

  const extraMonthlyKwh = calculateExtraMonthlyConsumption(extraConsumption);
  const invoiceDataPayload = {
    ...(rawExtraction?.invoice_data ?? {}),
    type: validatedData.billType,
    currentInvoiceConsumptionKwh: validatedData.currentInvoiceConsumptionKwh,
    averageMonthlyConsumptionKwh: validatedData.averageMonthlyConsumptionKwh,
    consumptionKwh: validatedData.currentInvoiceConsumptionKwh,
    extraConsumption:
      extraConsumption.hvac || extraConsumption.ev
        ? {
            hvac: extraConsumption.hvac,
            ev: extraConsumption.ev,
            hvacSquareMeters: extraConsumption.hvacSquareMeters,
            evAnnualKm: extraConsumption.evAnnualKm,
            extraMonthlyKwh: Math.round(extraMonthlyKwh * 100) / 100,
          }
        : null,
    periods: {
      P1: validatedData.periodConsumptionP1 ?? null,
      P2: validatedData.periodConsumptionP2 ?? null,
      P3: validatedData.periodConsumptionP3 ?? null,
      P4: validatedData.periodConsumptionP4 ?? null,
      P5: validatedData.periodConsumptionP5 ?? null,
      P6: validatedData.periodConsumptionP6 ?? null,
    },
    periodPricesEurPerKwh: {
      P1: validatedData.periodPriceP1 ?? null,
      P2: validatedData.periodPriceP2 ?? null,
      P3: validatedData.periodPriceP3 ?? null,
      P4: validatedData.periodPriceP4 ?? null,
      P5: validatedData.periodPriceP5 ?? null,
      P6: validatedData.periodPriceP6 ?? null,
    },
  };

  const locationPayload = {
    ...extractedLocation,
    address: validatedData.address,
    direccion_completa: validatedData.address,
    codigo_postal:
      extractedLocation.codigo_postal ??
      extractedLocation.codigoPostal ??
      extractedLocation.postalCode ??
      null,
    poblacion:
      extractedLocation.poblacion ??
      extractedLocation.ciudad ??
      extractedLocation.localidad ??
      extractedLocation.city ??
      null,
    provincia: extractedLocation.provincia ?? extractedLocation.state ?? null,
    pais: extractedLocation.pais ?? extractedLocation.country ?? "España",
    lat: clientCoordinates?.lat ?? null,
    lng: clientCoordinates?.lng ?? null,
  };

  return {
    customerPayload,
    invoiceDataPayload,
    locationPayload,
  };
}
