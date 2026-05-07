import type { ServerDependencies } from "../ports/serverDependencies";
import { hydrateInstallationAvailability } from "../../domain/installations/installationPolicy";

export async function listInstallationsUseCase(
  deps: ServerDependencies,
  params: {
    lat?: number | null;
    lng?: number | null;
    radius?: number | null;
  },
) {
  const requestedRadius =
    typeof params.radius === "number" ? params.radius : null;
  const radius =
    requestedRadius && Number.isFinite(requestedRadius) && requestedRadius > 0
      ? requestedRadius
      : deps.env.installationSearchRadiusMeters;

  const hasCoords =
    typeof params.lat === "number" &&
    Number.isFinite(params.lat) &&
    typeof params.lng === "number" &&
    Number.isFinite(params.lng);

  let installations = (await deps.repositories.installations.findActive()).map(
    (installation) =>
      hydrateInstallationAvailability(
        installation,
        hasCoords ? { lat: params.lat!, lng: params.lng! } : null,
      ),
  );

  if (hasCoords) {
    installations = installations
      .filter((installation) => Number(installation.distance_meters) <= radius)
      .sort(
        (a, b) => Number(a.distance_meters) - Number(b.distance_meters),
      );
  }

  return installations.map((installation) => ({
    ...installation,
    available_kwp: installation.availableKwp,
    confirmed_kwp: installation.confirmedKwp,
    reserved_kwp: installation.reservedKwp,
  }));
}
