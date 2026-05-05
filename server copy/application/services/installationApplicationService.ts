import type { ServerDependencies } from "../ports/serverDependencies";
import {
  buildInstallationSnapshot,
  getStudyCoordinates,
  hydrateInstallationAvailability,
  resolveAssignedKwpForInstallation,
} from "../../domain/installations/installationPolicy";
import { badRequest, notFound } from "../../shared/http/httpError";

export async function getInstallationCapacityState(
  deps: ServerDependencies,
  installationId: string,
) {
  const installation = await deps.repositories.installations.findById(
    installationId,
  );

  if (!installation) {
    throw notFound("La instalación no existe");
  }

  if (!installation.active) {
    throw badRequest("La instalación está inactiva");
  }

  const availability = hydrateInstallationAvailability(installation);

  return {
    installation,
    availableKwp: availability.availableKwp,
    confirmedKwp: availability.confirmedKwp,
    occupancyPercent: availability.occupancyPercent,
    reservedKwp: availability.reservedKwp,
    totalKwp: availability.totalKwp,
    usedKwp: availability.usedKwp,
  };
}

export async function findEligibleInstallationsForStudy(
  deps: ServerDependencies,
  params: {
    assignedKwp: number;
    radiusMeters?: number;
    studyId: string;
  },
) {
  const study = await deps.repositories.studies.findById(params.studyId);

  if (!study) {
    throw notFound("El estudio no existe");
  }

  const coords = getStudyCoordinates(study);

  if (!coords) {
    throw badRequest(
      "El estudio no tiene coordenadas válidas para buscar instalaciones cercanas",
    );
  }

  const installations = await deps.repositories.installations.findActive();

  const withinRange = installations
    .map((installation) => {
      const availability = hydrateInstallationAvailability(installation, coords);
      const resolvedAssignment = resolveAssignedKwpForInstallation({
        installation,
        requestedKwp: params.assignedKwp,
      });

      return {
        ...availability,
        assignedKwpSource: resolvedAssignment.source,
        calculationMode: resolvedAssignment.calculationMode,
        effectiveAssignedKwp: resolvedAssignment.assignedKwp,
      };
    })
    .filter(
      (installation) =>
        Number(installation.distance_meters ?? Number.MAX_SAFE_INTEGER) <=
        (params.radiusMeters ?? deps.env.installationSearchRadiusMeters),
    )
    .sort(
      (a, b) =>
        Number(a.distance_meters ?? Number.MAX_SAFE_INTEGER) -
        Number(b.distance_meters ?? Number.MAX_SAFE_INTEGER),
    );

  if (withinRange.length === 0) {
    return {
      coords,
      eligible: [],
      reason: "no_installations_in_range" as const,
      recommended: null,
      study,
      withinRange,
    };
  }

  const eligible = withinRange
    .filter(
      (installation) =>
        installation.availableKwp >= installation.effectiveAssignedKwp,
    )
    .sort((a, b) => {
      if (a.distance_meters !== b.distance_meters) {
        return Number(a.distance_meters) - Number(b.distance_meters);
      }

      return a.occupancyPercent - b.occupancyPercent;
    });

  return {
    coords,
    eligible,
    reason: eligible.length === 0 ? ("no_capacity_in_range" as const) : null,
    recommended: eligible[0] ?? null,
    study,
    withinRange,
  };
}

export function buildAutoAssignmentSnapshot(params: {
  installation: any;
  requestedAssignedKwp: number;
}) {
  const nextUsedKwp =
    Number(params.installation.usedKwp) +
    Number(params.installation.effectiveAssignedKwp);
  const nextAvailableKwp = Math.max(
    Number(params.installation.totalKwp) - nextUsedKwp,
    0,
  );

  return buildInstallationSnapshot({
    assignedKwp: params.installation.effectiveAssignedKwp,
    availableKwp: nextAvailableKwp,
    calculationMode: params.installation.calculationMode,
    confirmedKwp: params.installation.confirmedKwp,
    distanceMeters: params.installation.distance_meters,
    installation: params.installation,
    requestedAssignedKwp: params.requestedAssignedKwp,
    reservedKwp: params.installation.reservedKwp,
    source: params.installation.assignedKwpSource,
    totalKwp: params.installation.totalKwp,
    usedKwp: nextUsedKwp,
  });
}
