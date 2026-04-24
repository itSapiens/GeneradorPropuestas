import { haversineDistanceMeters } from "../../utils/geo";
import { toNullableNumber, toPositiveNumber } from "../../utils/parsingUtils";
import { pickFirstString } from "../../utils/stringUtils";

export function getStudyCoordinates(
  study: any,
): { lat: number; lng: number } | null {
  const lat =
    toNullableNumber(study?.location?.lat) ??
    toNullableNumber(study?.location?.latitude) ??
    toNullableNumber(study?.customer?.lat) ??
    toNullableNumber(study?.customer?.latitude) ??
    toNullableNumber(study?.invoice_data?.lat) ??
    toNullableNumber(study?.invoice_data?.latitude);

  const lng =
    toNullableNumber(study?.location?.lng) ??
    toNullableNumber(study?.location?.lon) ??
    toNullableNumber(study?.location?.longitude) ??
    toNullableNumber(study?.customer?.lng) ??
    toNullableNumber(study?.customer?.lon) ??
    toNullableNumber(study?.customer?.longitude) ??
    toNullableNumber(study?.invoice_data?.lng) ??
    toNullableNumber(study?.invoice_data?.lon) ??
    toNullableNumber(study?.invoice_data?.longitude);

  if (lat === null || lng === null) return null;

  return { lat, lng };
}

export function resolveAssignedKwpForInstallation(params: {
  installation: any;
  requestedKwp: number;
}) {
  const calculoMode = String(params.installation?.calculo_estudios ?? "")
    .toLowerCase()
    .trim();
  const fixedKwp = Number(params.installation?.potencia_fija_kwp ?? 0);

  if (calculoMode === "fijo" && Number.isFinite(fixedKwp) && fixedKwp > 0) {
    return {
      assignedKwp: fixedKwp,
      calculationMode: "fijo" as const,
      source: "fixed" as const,
    };
  }

  return {
    assignedKwp: params.requestedKwp,
    calculationMode: "segun_factura" as const,
    source: "calculated" as const,
  };
}

export const DEFAULT_RESERVATION_AMOUNT_EUR = 500;

export function resolveReservationAmountForInstallation(params: {
  installation: any;
  assignedKwp: number;
  fallbackAmount?: unknown;
}) {
  const fixedReservationAmount = toPositiveNumber(
    params.installation?.reserva_fija_eur,
  );

  if (fixedReservationAmount !== null) {
    return {
      reservationMode: "fija" as const,
      signalAmount: fixedReservationAmount,
      source: "fixed" as const,
    };
  }

  return {
    reservationMode: "segun_potencia" as const,
    signalAmount: DEFAULT_RESERVATION_AMOUNT_EUR,
    source: "default" as const,
  };
}

export function resolveInstallationBankIban(
  installation: any,
  fallbackIban: string,
): string {
  return (
    pickFirstString(installation?.iban_aportaciones, fallbackIban) ?? fallbackIban
  );
}

export function hydrateInstallationAvailability(
  installation: any,
  origin?: { lat: number; lng: number } | null,
) {
  const totalKwp = Number(
    installation.contractable_kwp_total ??
      installation.potencia_instalada_kwp ??
      0,
  );
  const reservedKwp = Number(installation.contractable_kwp_reserved ?? 0);
  const confirmedKwp = Number(installation.contractable_kwp_confirmed ?? 0);
  const usedKwp = reservedKwp + confirmedKwp;
  const availableKwp = Math.max(totalKwp - usedKwp, 0);
  const occupancyPercent =
    totalKwp > 0 ? Number(((usedKwp / totalKwp) * 100).toFixed(2)) : 0;

  return {
    ...installation,
    availableKwp,
    confirmedKwp,
    distance_meters:
      origin && Number.isFinite(Number(installation.lat)) && Number.isFinite(Number(installation.lng))
        ? haversineDistanceMeters(
            origin.lat,
            origin.lng,
            Number(installation.lat),
            Number(installation.lng),
          )
        : undefined,
    occupancyPercent,
    reservedKwp,
    totalKwp,
    usedKwp,
  };
}

export function buildInstallationSnapshot(params: {
  assignedKwp: number;
  availableKwp: number;
  calculationMode?: string | null;
  confirmedKwp?: number;
  distanceMeters?: number;
  installation: any;
  requestedAssignedKwp?: number | null;
  reservedKwp?: number;
  source?: string | null;
  totalKwp: number;
  usedKwp: number;
}) {
  const occupancyPercent =
    params.totalKwp > 0
      ? Number(((params.usedKwp / params.totalKwp) * 100).toFixed(2))
      : 0;

  return {
    installationId: params.installation.id,
    installationName: params.installation.nombre_instalacion,
    installationData: {
      id: params.installation.id,
      nombre_instalacion: params.installation.nombre_instalacion,
      direccion: params.installation.direccion ?? null,
      lat: params.installation.lat ?? null,
      lng: params.installation.lng ?? null,
      potencia_instalada_kwp: params.totalKwp,
      active: params.installation.active,
      calculo_estudios: params.installation.calculo_estudios ?? null,
      potencia_fija_kwp: params.installation.potencia_fija_kwp ?? null,
      reserva: params.installation.reserva ?? null,
      reserva_fija_eur: params.installation.reserva_fija_eur ?? null,
      iban_aportaciones: params.installation.iban_aportaciones ?? null,
    },
    requested_assigned_kwp: params.requestedAssignedKwp ?? null,
    assigned_kwp: params.assignedKwp,
    assigned_kwp_source: params.source ?? null,
    calculation_mode: params.calculationMode ?? null,
    occupancy: {
      total_kwp: params.totalKwp,
      reserved_kwp: params.reservedKwp ?? null,
      confirmed_kwp: params.confirmedKwp ?? null,
      used_kwp: params.usedKwp,
      available_kwp: params.availableKwp,
      occupancy_percent: occupancyPercent,
    },
    distance_meters: params.distanceMeters ?? null,
    updated_at: new Date().toISOString(),
  };
}
