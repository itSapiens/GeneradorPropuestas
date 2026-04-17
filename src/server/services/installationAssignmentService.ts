import { supabase } from "../clients/supabaseClient";
import { SAPIENS_BANK_ACCOUNT_IBAN } from "../config/env";
import { haversineDistanceMeters } from "../utils/geo";
import { toNullableNumber, toPositiveNumber } from "../utils/parsingUtils";
import { pickFirstString } from "../utils/stringUtils";

export function getStudyCoordinates(study: any): { lat: number; lng: number } | null {
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
export type InstallationStudyCalculationMode = "segun_factura" | "fijo";
export type InstallationReservationMode = "segun_potencia" | "fija";

export function normalizeInstallationStudyCalculationMode(
  value: unknown,
): InstallationStudyCalculationMode {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (normalized === "fijo" || normalized === "fixed") {
    return "fijo";
  }

  return "segun_factura";
}

export function normalizeInstallationReservationMode(
  value: unknown,
): InstallationReservationMode {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    normalized === "fija" ||
    normalized === "fijo" ||
    normalized === "fixed"
  ) {
    return "fija";
  }

  return "segun_potencia";
}

/**
 * Decide la potencia asignada al estudio:
 * - Si calculo_estudios === "fijo" y potencia_fija_kwp > 0 → usa la fija.
 * - En cualquier otro caso → usa la calculada a partir de la factura.
 */
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
      source: "fixed" as const,
      calculationMode: "fijo" as const,
    };
  }

  return {
    assignedKwp: params.requestedKwp,
    source: "calculated" as const,
    calculationMode: "segun_factura" as const,
  };
}

export function resolveReservationAmountForInstallation(params: {
  installation: any;
  assignedKwp: number;
  fallbackAmount?: unknown;
}) {
  const calculoMode = String(params.installation?.calculo_estudios ?? "")
    .toLowerCase()
    .trim();
  const fixedKwp =
    toNullableNumber(params.installation?.potencia_fija_kwp) ?? 0;
  const fixedReservationAmount = toPositiveNumber(
    params.installation?.reserva_fija_eur,
  );

  // Solo se usa la reserva fija cuando calculo_estudios === "fijo"
  if (calculoMode === "fijo" && fixedKwp > 0) {
    if (fixedReservationAmount === null) {
      throw new Error(
        "La instalación tiene potencia fija pero no tiene reserva_fija_eur válida",
      );
    }

    return {
      reservationMode: "fija" as const,
      signalAmount: fixedReservationAmount,
      source: "fixed" as const,
    };
  }

  // Si potencia fija es 0, usar el cálculo de siempre
  const fallbackAmount = toPositiveNumber(params.fallbackAmount);

  if (fallbackAmount !== null) {
    return {
      reservationMode: "segun_potencia" as const,
      signalAmount: fallbackAmount,
      source: "fallback" as const,
    };
  }

  throw new Error("No se ha podido determinar el importe de la reserva");
}

export function resolveInstallationBankIban(installation: any): string {
  return (
    pickFirstString(
      installation?.iban_aportaciones,
      SAPIENS_BANK_ACCOUNT_IBAN,
    ) ?? SAPIENS_BANK_ACCOUNT_IBAN
  );
}

export type InstallationWithAvailability = {
  id: string;
  nombre_instalacion: string;
  direccion: string;
  lat: number;
  lng: number;
  active: boolean;
  potencia_instalada_kwp: number;
  distance_meters: number;
  totalKwp: number;
  reservedKwp: number;
  confirmedKwp: number;
  usedKwp: number;
  availableKwp: number;
  occupancyPercent: number;

  effectiveAssignedKwp: number;
  assignedKwpSource: "fixed" | "calculated";
  calculationMode: "segun_factura" | "fijo";

  calculo_estudios?: string | null;
  potencia_fija_kwp?: number | null;
  reserva?: string | null;
  reserva_fija_eur?: number | null;
  iban_aportaciones?: string | null;
};

export type FindEligibleInstallationsResult = {
  study: any;
  coords: { lat: number; lng: number };
  withinRange: InstallationWithAvailability[];
  eligible: InstallationWithAvailability[];
  recommended: InstallationWithAvailability | null;
  reason: "no_installations_in_range" | "no_capacity_in_range" | null;
};

export async function findEligibleInstallationsForStudy(params: {
  studyId: string;
  assignedKwp: number;
  radiusMeters?: number;
}): Promise<FindEligibleInstallationsResult> {
  const radiusMeters = params.radiusMeters ?? 5000;

  const { data: study, error: studyError } = await supabase
    .from("studies")
    .select("*")
    .eq("id", params.studyId)
    .single();

  if (studyError || !study) {
    throw new Error("El estudio no existe");
  }

  const coords = getStudyCoordinates(study);

  if (!coords) {
    throw new Error(
      "El estudio no tiene coordenadas válidas para buscar instalaciones cercanas",
    );
  }

  const { data: installations, error: installationsError } = await supabase
    .from("installations")
    .select("*")
    .eq("active", true)
    .order("nombre_instalacion", { ascending: true });

  if (installationsError) {
    throw new Error(
      `No se pudieron obtener las instalaciones: ${installationsError.message}`,
    );
  }

  const withinRange = (installations ?? [])
    .map((installation: any) => {
      const distance_meters = haversineDistanceMeters(
        coords.lat,
        coords.lng,
        Number(installation.lat),
        Number(installation.lng),
      );

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

      const resolvedAssignment = resolveAssignedKwpForInstallation({
        installation,
        requestedKwp: params.assignedKwp,
      });

      return {
        ...installation,
        distance_meters,
        totalKwp,
        reservedKwp,
        confirmedKwp,
        usedKwp,
        availableKwp,
        occupancyPercent,
        effectiveAssignedKwp: resolvedAssignment.assignedKwp,
        assignedKwpSource: resolvedAssignment.source,
        calculationMode: resolvedAssignment.calculationMode,
      };
    })
    .filter((installation) => installation.distance_meters <= radiusMeters)
    .sort((a, b) => a.distance_meters - b.distance_meters);

  if (withinRange.length === 0) {
    return {
      study,
      coords,
      withinRange: [],
      eligible: [],
      recommended: null,
      reason: "no_installations_in_range",
    };
  }

  const eligible = withinRange
    .filter(
      (installation) =>
        installation.availableKwp >= installation.effectiveAssignedKwp,
    )
    .sort((a, b) => {
      if (a.distance_meters !== b.distance_meters) {
        return a.distance_meters - b.distance_meters;
      }

      return a.occupancyPercent - b.occupancyPercent;
    });

  return {
    study,
    coords,
    withinRange,
    eligible,
    recommended: eligible[0] ?? null,
    reason: eligible.length === 0 ? "no_capacity_in_range" : null,
  };
}

export async function getInstallationCapacityState(params: {
  installationId: string;
}) {
  const { installationId } = params;

  const { data: installation, error: installationError } = await supabase
    .from("installations")
    .select(
      "id, nombre_instalacion, direccion, lat, lng, potencia_instalada_kwp, contractable_kwp_total, contractable_kwp_reserved, contractable_kwp_confirmed, active, calculo_estudios, potencia_fija_kwp, reserva, reserva_fija_eur, iban_aportaciones",
    )
    .eq("id", installationId)
    .single();

  if (installationError || !installation) {
    throw new Error("La instalación no existe");
  }

  if (!installation.active) {
    throw new Error("La instalación está inactiva");
  }

  const totalKwp = Number(
    (installation as any).contractable_kwp_total ??
      installation.potencia_instalada_kwp ??
      0,
  );

  const reservedKwp = Number(
    (installation as any).contractable_kwp_reserved ?? 0,
  );

  const confirmedKwp = Number(
    (installation as any).contractable_kwp_confirmed ?? 0,
  );

  const usedKwp = reservedKwp + confirmedKwp;
  const availableKwp = Math.max(totalKwp - usedKwp, 0);
  const occupancyPercent =
    totalKwp > 0 ? Number(((usedKwp / totalKwp) * 100).toFixed(2)) : 0;

  return {
    installation,
    totalKwp,
    reservedKwp,
    confirmedKwp,
    usedKwp,
    availableKwp,
    occupancyPercent,
  };
}

export async function validateInstallationAssignment(params: {
  installationId: string;
  assignedKwp: number;
}) {
  const state = await getInstallationCapacityState({
    installationId: params.installationId,
  });

  if (params.assignedKwp > state.availableKwp) {
    throw new Error(
      `No hay capacidad suficiente en la instalación. Disponibles: ${state.availableKwp.toFixed(
        2,
      )} kWp`,
    );
  }

  const nextUsedKwp = state.usedKwp + params.assignedKwp;

  return {
    ...state,
    assignedKwp: params.assignedKwp,
    nextUsedKwp,
    nextAvailableKwp: Math.max(state.totalKwp - nextUsedKwp, 0),
    nextOccupancyPercent:
      state.totalKwp > 0
        ? Number(((nextUsedKwp / state.totalKwp) * 100).toFixed(2))
        : 0,
  };
}

export function buildInstallationSnapshot(params: {
  installation: {
    id: string;
    nombre_instalacion: string;
    potencia_instalada_kwp: number;
    active?: boolean;
  };
  assignedKwp: number;
  totalKwp: number;
  reservedKwp?: number;
  confirmedKwp?: number;
  usedKwp: number;
  availableKwp: number;
  occupancyPercent: number;
}) {
  return {
    installationId: params.installation.id,
    installationName: params.installation.nombre_instalacion,
    installationData: {
      id: params.installation.id,
      nombre_instalacion: params.installation.nombre_instalacion,
      potencia_instalada_kwp: params.totalKwp,
      active: params.installation.active ?? true,
    },
    assigned_kwp: params.assignedKwp,
    occupancy: {
      total_kwp: params.totalKwp,
      reserved_kwp: params.reservedKwp ?? null,
      confirmed_kwp: params.confirmedKwp ?? null,
      used_kwp: params.usedKwp,
      available_kwp: params.availableKwp,
      occupancy_percent: params.occupancyPercent,
    },
    updated_at: new Date().toISOString(),
  };
}
