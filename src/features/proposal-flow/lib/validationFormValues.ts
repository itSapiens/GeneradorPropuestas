import type { UseFormSetValue } from "react-hook-form";
import type {
  ValidationBillData,
  ValidationBillDataFormInput,
} from "@/src/entities/proposal/domain/proposal.types";

export function applyExtractedBillToValidationForm(
  mappedData: Partial<ValidationBillData>,
  setValue: UseFormSetValue<ValidationBillDataFormInput>,
) {
  if (mappedData.name) setValue("name", mappedData.name);
  if (mappedData.lastName) setValue("lastName", mappedData.lastName);
  if (mappedData.dni) setValue("dni", mappedData.dni);
  if (mappedData.cups) setValue("cups", mappedData.cups);
  if (mappedData.address) setValue("address", mappedData.address);
  if (mappedData.email) setValue("email", mappedData.email);
  if (mappedData.phone) setValue("phone", mappedData.phone);
  if (mappedData.iban) setValue("iban", mappedData.iban);
  if (mappedData.contractedPowerText) {
    setValue("contractedPowerText", mappedData.contractedPowerText);
  }
  if (typeof mappedData.contractedPowerKw === "number") {
    setValue("contractedPowerKw", mappedData.contractedPowerKw);
  }
  if (typeof mappedData.contractedPowerP1 === "number") {
    setValue("contractedPowerP1", mappedData.contractedPowerP1);
  }
  if (typeof mappedData.contractedPowerP2 === "number") {
    setValue("contractedPowerP2", mappedData.contractedPowerP2);
  }
  if (mappedData.ibanMasked) {
    setValue("ibanMasked", mappedData.ibanMasked);
  }
  if (typeof mappedData.monthlyConsumption === "number") {
    setValue("monthlyConsumption", mappedData.monthlyConsumption);
  }
  if (mappedData.billType) {
    setValue("billType", mappedData.billType);
  }
  if (typeof mappedData.currentInvoiceConsumptionKwh === "number") {
    setValue(
      "currentInvoiceConsumptionKwh",
      mappedData.currentInvoiceConsumptionKwh,
    );
  }
  if (typeof mappedData.averageMonthlyConsumptionKwh === "number") {
    setValue(
      "averageMonthlyConsumptionKwh",
      mappedData.averageMonthlyConsumptionKwh,
    );
  }

  if (typeof mappedData.periodConsumptionP1 === "number") {
    setValue("periodConsumptionP1", mappedData.periodConsumptionP1);
  }
  if (typeof mappedData.periodConsumptionP2 === "number") {
    setValue("periodConsumptionP2", mappedData.periodConsumptionP2);
  }
  if (typeof mappedData.periodConsumptionP3 === "number") {
    setValue("periodConsumptionP3", mappedData.periodConsumptionP3);
  }
  if (typeof mappedData.periodConsumptionP4 === "number") {
    setValue("periodConsumptionP4", mappedData.periodConsumptionP4);
  }
  if (typeof mappedData.periodConsumptionP5 === "number") {
    setValue("periodConsumptionP5", mappedData.periodConsumptionP5);
  }
  if (typeof mappedData.periodConsumptionP6 === "number") {
    setValue("periodConsumptionP6", mappedData.periodConsumptionP6);
  }

  if (typeof mappedData.periodPriceP1 === "number") {
    setValue("periodPriceP1", mappedData.periodPriceP1);
  }
  if (typeof mappedData.periodPriceP2 === "number") {
    setValue("periodPriceP2", mappedData.periodPriceP2);
  }
  if (typeof mappedData.periodPriceP3 === "number") {
    setValue("periodPriceP3", mappedData.periodPriceP3);
  }
  if (typeof mappedData.periodPriceP4 === "number") {
    setValue("periodPriceP4", mappedData.periodPriceP4);
  }
  if (typeof mappedData.periodPriceP5 === "number") {
    setValue("periodPriceP5", mappedData.periodPriceP5);
  }
  if (typeof mappedData.periodPriceP6 === "number") {
    setValue("periodPriceP6", mappedData.periodPriceP6);
  }
}
