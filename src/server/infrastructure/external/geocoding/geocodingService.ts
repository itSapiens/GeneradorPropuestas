import crypto from "node:crypto";

import { GOOGLE_MAPS_GEOCODING_API_KEY } from "../../config/env";

function normalizeAddressForGeocoding(address: string): string {
  return address
    .replace(/\s+/g, " ")
    .replace(/,+/g, ",")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

export type GeocodeErrorReason =
  | "invalid_request"
  | "zero_results"
  | "quota_exceeded"
  | "daily_limit"
  | "request_denied"
  | "network_timeout"
  | "network_error"
  | "upstream_error";

export class GeocodeError extends Error {
  reason: GeocodeErrorReason;
  status: number;
  constructor(reason: GeocodeErrorReason, message: string, status = 502) {
    super(message);
    this.reason = reason;
    this.status = status;
  }
}

const GEOCODE_CACHE_TTL_MS = Number(
  process.env.GEOCODE_CACHE_TTL_MS || 30 * 60 * 1000,
);
const GEOCODE_CACHE_MAX_ENTRIES = Number(
  process.env.GEOCODE_CACHE_MAX_ENTRIES || 200,
);
type GeocodeCacheEntry = {
  data: {
    lat: number;
    lng: number;
    formattedAddress: string | null;
    placeId: string | null;
  };
  ts: number;
};
const geocodeCache = new Map<string, GeocodeCacheEntry>();

function geocodeCacheGet(key: string): GeocodeCacheEntry["data"] | null {
  const entry = geocodeCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > GEOCODE_CACHE_TTL_MS) {
    geocodeCache.delete(key);
    return null;
  }
  return entry.data;
}

function geocodeCacheSet(key: string, data: GeocodeCacheEntry["data"]): void {
  if (geocodeCache.size >= GEOCODE_CACHE_MAX_ENTRIES) {
    const oldestKey = geocodeCache.keys().next().value;
    if (oldestKey) geocodeCache.delete(oldestKey);
  }
  geocodeCache.set(key, { data, ts: Date.now() });
}

const GEOCODE_MAX_ATTEMPTS = Number(process.env.GEOCODE_MAX_ATTEMPTS || 3);
const GEOCODE_TIMEOUT_MS = Number(process.env.GEOCODE_TIMEOUT_MS || 8000);
const GEOCODE_RETRY_BASE_MS = Number(process.env.GEOCODE_RETRY_BASE_MS || 400);

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function geocodeAddressWithGoogle(address: string): Promise<{
  lat: number;
  lng: number;
  formattedAddress: string | null;
  placeId: string | null;
} | null> {
  const normalizedAddress = normalizeAddressForGeocoding(address);

  if (!normalizedAddress) return null;

  const cacheKey = crypto
    .createHash("sha256")
    .update(normalizedAddress.toLowerCase())
    .digest("hex");
  const cached = geocodeCacheGet(cacheKey);
  if (cached) {
    return cached;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", normalizedAddress);
  url.searchParams.set("region", "es");
  url.searchParams.set("language", "es");
  url.searchParams.set("components", "country:ES");
  url.searchParams.set("key", GOOGLE_MAPS_GEOCODING_API_KEY);

  let lastError: any = null;

  for (let attempt = 1; attempt <= GEOCODE_MAX_ATTEMPTS; attempt++) {
    const abortCtrl = new AbortController();
    const timeoutHandle = setTimeout(() => abortCtrl.abort(), GEOCODE_TIMEOUT_MS);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: abortCtrl.signal,
      });
      clearTimeout(timeoutHandle);

      if (!response.ok) {
        if (response.status >= 500 && attempt < GEOCODE_MAX_ATTEMPTS) {
          lastError = new GeocodeError(
            "upstream_error",
            `Google devolvió ${response.status}`,
            502,
          );
          await sleepMs(GEOCODE_RETRY_BASE_MS * 2 ** (attempt - 1));
          continue;
        }
        throw new GeocodeError(
          "upstream_error",
          `Google devolvió ${response.status}`,
          502,
        );
      }

      const json = await response.json();

      switch (json.status) {
        case "OK": {
          const first = json.results?.[0];
          const lat = Number(first?.geometry?.location?.lat);
          const lng = Number(first?.geometry?.location?.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            throw new GeocodeError(
              "upstream_error",
              "Google devolvió OK pero sin coordenadas válidas",
              502,
            );
          }

          const resultTypes: string[] = Array.isArray(first?.types)
            ? first.types
            : [];
          const TOO_GENERIC_TYPES = new Set([
            "country",
            "administrative_area_level_1",
            "administrative_area_level_2",
            "administrative_area_level_3",
            "administrative_area_level_4",
            "political",
          ]);
          const hasGranular = resultTypes.some((t) =>
            [
              "street_address",
              "premise",
              "subpremise",
              "route",
              "intersection",
              "point_of_interest",
              "establishment",
              "postal_code",
              "plus_code",
            ].includes(t),
          );
          const isOnlyGeneric =
            resultTypes.length > 0 &&
            resultTypes.every((t) => TOO_GENERIC_TYPES.has(t)) &&
            !hasGranular;

          if (isOnlyGeneric) {
            return null;
          }

          if (
            first?.partial_match === true &&
            !resultTypes.includes("street_address") &&
            !resultTypes.includes("premise") &&
            !resultTypes.includes("subpremise") &&
            !resultTypes.includes("route")
          ) {
            return null;
          }

          const result = {
            lat,
            lng,
            formattedAddress: first?.formatted_address ?? null,
            placeId: first?.place_id ?? null,
          };
          geocodeCacheSet(cacheKey, result);
          return result;
        }

        case "ZERO_RESULTS":
          return null;

        case "OVER_QUERY_LIMIT":
          throw new GeocodeError(
            "quota_exceeded",
            "Hemos alcanzado el límite de peticiones a Google Maps.",
            429,
          );

        case "OVER_DAILY_LIMIT":
          throw new GeocodeError(
            "daily_limit",
            "La cuota diaria de Google Maps está agotada.",
            429,
          );

        case "REQUEST_DENIED":
          throw new GeocodeError(
            "request_denied",
            json.error_message ||
              "Google rechazó la petición (API key inválida o sin permisos).",
            500,
          );

        case "INVALID_REQUEST":
          throw new GeocodeError(
            "invalid_request",
            json.error_message || "Petición inválida a Google Maps.",
            400,
          );

        case "UNKNOWN_ERROR":
          lastError = new GeocodeError(
            "upstream_error",
            json.error_message || "Error desconocido de Google Maps.",
            502,
          );
          if (attempt < GEOCODE_MAX_ATTEMPTS) {
            await sleepMs(GEOCODE_RETRY_BASE_MS * 2 ** (attempt - 1));
            continue;
          }
          throw lastError;

        default:
          throw new GeocodeError(
            "upstream_error",
            `Status inesperado de Google: ${json.status}`,
            502,
          );
      }
    } catch (error: any) {
      clearTimeout(timeoutHandle);

      if (error instanceof GeocodeError) throw error;

      if (error?.name === "AbortError") {
        lastError = new GeocodeError(
          "network_timeout",
          `Timeout al llamar a Google Maps (${GEOCODE_TIMEOUT_MS}ms)`,
          504,
        );
        if (attempt < GEOCODE_MAX_ATTEMPTS) {
          await sleepMs(GEOCODE_RETRY_BASE_MS * 2 ** (attempt - 1));
          continue;
        }
        throw lastError;
      }

      lastError = new GeocodeError(
        "network_error",
        `Error de red al llamar a Google Maps: ${error?.message || "desconocido"}`,
        502,
      );
      if (attempt < GEOCODE_MAX_ATTEMPTS) {
        await sleepMs(GEOCODE_RETRY_BASE_MS * 2 ** (attempt - 1));
        continue;
      }
      throw lastError;
    }
  }

  throw (
    lastError ??
    new GeocodeError("upstream_error", "Geocoding falló tras reintentos")
  );
}
