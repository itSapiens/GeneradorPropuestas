import { TFunction } from "i18next";
import { ApiInstallation, ProposalMode } from "@/src/entities/proposal/domain/proposal.types";
import { BillDataSchema } from "@/src/shared/lib/validators";
import { optionalNumberField } from "@/src/features/proposal-flow/lib/proposalNumbers";
import z from "zod";
import { BILL_TYPES } from "@/src/shared/lib/constants/proposal.constants";

export function getAvailableProposalModes(
  modalidad: ApiInstallation["modalidad"] | null | undefined,
): ProposalMode[] {
  if (modalidad === "inversion") return ["investment"];
  if (modalidad === "servicio") return ["service"];
  return ["investment", "service"];
}

export function normalizeInstallationModalidad(
  modalidad: string | null | undefined,
): ApiInstallation["modalidad"] {
  const value = (modalidad ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (value === "inversion") return "inversion";
  if (value === "servicio" || value === "service") return "servicio";
  if (value === "ambas") return "ambas";

  return "ambas";
}


export function getInstallationModeLabel(
  modalidad: ApiInstallation["modalidad"] | string | null | undefined,
  t: TFunction,
): string {
  const normalized = normalizeInstallationModalidad(modalidad);

  if (normalized === "inversion") {
    return t("map.installationCard.modes.investment", "Inversión");
  }

  if (normalized === "servicio") {
    return t("map.installationCard.modes.service", "Servicio");
  }

  return t("map.installationCard.modes.both", "Ambas");
}

export function getDefaultProposalMode(
  modalidad: ApiInstallation["modalidad"] | null | undefined,
): ProposalMode {
  const modes = getAvailableProposalModes(modalidad);
  return modes[0] ?? "investment";
}

export const ValidationBillDataSchema = BillDataSchema.extend({
  cups: z.string().optional(),
  iban: z.string().optional(),

  monthlyConsumption: optionalNumberField,

  billType: z.enum(BILL_TYPES, {
    error: "Selecciona el tipo de factura",
  }),

  currentInvoiceConsumptionKwh: optionalNumberField,
  averageMonthlyConsumptionKwh: optionalNumberField,
  billedDays: optionalNumberField,
  invoiceTotalAmountEur: optionalNumberField,

  periodConsumptionP1: optionalNumberField,
  periodConsumptionP2: optionalNumberField,
  periodConsumptionP3: optionalNumberField,
  periodConsumptionP4: optionalNumberField,
  periodConsumptionP5: optionalNumberField,
  periodConsumptionP6: optionalNumberField,

  periodPriceP1: optionalNumberField,
  periodPriceP2: optionalNumberField,
  periodPriceP3: optionalNumberField,
  periodPriceP4: optionalNumberField,
  periodPriceP5: optionalNumberField,
  periodPriceP6: optionalNumberField,

  ibanMasked: z.string().optional(),
  contractedPowerText: z.string().optional(),
  contractedPowerKw: optionalNumberField,
  contractedPowerP1: optionalNumberField,
  contractedPowerP2: optionalNumberField,
});

