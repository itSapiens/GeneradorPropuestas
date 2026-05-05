import type { ServerDependencies } from "../ports/serverDependencies";
import { badRequest } from "../../shared/http/httpError";

export async function geocodeAddressUseCase(
  deps: ServerDependencies,
  address: string,
) {
  const normalizedAddress = String(address || "").trim();

  if (!normalizedAddress) {
    throw badRequest("La dirección es obligatoria");
  }

  const geocoded = await deps.services.geocoding.geocodeAddress(normalizedAddress);

  if (!geocoded) {
    return {
      coords: null,
      formattedAddress: null,
      placeId: null,
      reason: "zero_results",
      success: false,
    };
  }

  return {
    coords: {
      lat: geocoded.lat,
      lng: geocoded.lng,
    },
    formattedAddress: geocoded.formattedAddress,
    placeId: geocoded.placeId,
    success: true,
  };
}
