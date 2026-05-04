import crypto from "node:crypto";

import { GOOGLE_MAPS_GEOCODING_API_KEY } from "../../config/env";

const SPANISH_PROVINCES = [
  "A Coruna",
  "Alava",
  "Albacete",
  "Alicante",
  "Almeria",
  "Asturias",
  "Avila",
  "Badajoz",
  "Barcelona",
  "Bizkaia",
  "Burgos",
  "Caceres",
  "Cadiz",
  "Cantabria",
  "Castellon",
  "Ceuta",
  "Ciudad Real",
  "Cordoba",
  "Cuenca",
  "Girona",
  "Granada",
  "Guadalajara",
  "Gipuzkoa",
  "Huelva",
  "Huesca",
  "Illes Balears",
  "Jaen",
  "La Rioja",
  "Las Palmas",
  "Leon",
  "Lleida",
  "Lugo",
  "Madrid",
  "Malaga",
  "Melilla",
  "Murcia",
  "Navarra",
  "Ourense",
  "Palencia",
  "Pontevedra",
  "Salamanca",
  "Santa Cruz de Tenerife",
  "Segovia",
  "Sevilla",
  "Soria",
  "Tarragona",
  "Teruel",
  "Toledo",
  "Valencia",
  "Valladolid",
  "Zamora",
  "Zaragoza",
] as const;

function normalizeAddressForGeocoding(address: string): string {
  return address
    .replace(/\s+/g, " ")
    .replace(/,+/g, ",")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

function normalizeComparableText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function titleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function findProvince(value: string): string | null {
  const comparable = normalizeComparableText(value);

  for (const province of [...SPANISH_PROVINCES].sort((a, b) => b.length - a.length)) {
    const provinceComparable = normalizeComparableText(province);
    if (
      comparable === provinceComparable ||
      comparable.endsWith(` ${provinceComparable}`)
    ) {
      return titleCase(province);
    }
  }

  return null;
}

type ParsedAddress = {
  locality: string | null;
  normalized: string;
  postalCode: string | null;
  province: string | null;
  streetLine: string | null;
};

function parseAddressForGeocoding(address: string): ParsedAddress {
  const normalized = normalizeAddressForGeocoding(
    address.replace(/\(([^)]+)\)/g, ", $1"),
  );
  const postalCode = normalized.match(/\b(\d{5})\b/)?.[1] ?? null;

  if (!postalCode) {
    return {
      locality: null,
      normalized,
      postalCode: null,
      province: null,
      streetLine: normalized || null,
    };
  }

  const [beforePostalRaw, afterPostalRaw = ""] = normalized.split(postalCode);
  const streetLine = normalizeAddressForGeocoding(beforePostalRaw);
  const afterPostal = afterPostalRaw.replace(/^[,\s-]+/, "").trim();

  const province = afterPostal ? findProvince(afterPostal) : null;
  let locality = afterPostal;

  if (province) {
    const comparableTail = normalizeComparableText(locality);
    const comparableProvince = normalizeComparableText(province);

    if (comparableTail === comparableProvince) {
      locality = "";
    } else if (comparableTail.endsWith(` ${comparableProvince}`)) {
      locality = locality.slice(0, locality.length - province.length).trim();
    }
  }

  locality = locality.replace(/[,\s-]+$/, "").trim();

  return {
    locality: locality || null,
    normalized,
    postalCode,
    province,
    streetLine: streetLine || null,
  };
}

function buildStreetLineVariants(
  streetLine: string | null,
  province: string | null,
): string[] {
  if (!streetLine) return [];

  const variants = new Set<string>();
  const normalizedStreet = normalizeAddressForGeocoding(streetLine);
  variants.add(normalizedStreet);

  const rest = normalizedStreet.replace(/^(C\/|C\.|CL\.?|CL)\s*/i, "").trim();
  if (rest && rest !== normalizedStreet) {
    variants.add(`Calle ${rest}`);

    if (
      province &&
      ["Valencia", "Castellon", "Alicante", "Barcelona", "Girona", "Lleida", "Tarragona", "Illes Balears"].includes(
        province,
      )
    ) {
      variants.add(`Carrer ${rest}`);
    }
  }

  return [...variants];
}

function buildAddressCandidates(address: string): string[] {
  const parsed = parseAddressForGeocoding(address);
  const candidates = new Set<string>();

  if (parsed.normalized) {
    candidates.add(parsed.normalized);
  }

  if (parsed.streetLine && parsed.postalCode && parsed.locality && parsed.province) {
    for (const streetVariant of buildStreetLineVariants(
      parsed.streetLine,
      parsed.province,
    )) {
      candidates.add(
        `${streetVariant}, ${parsed.postalCode} ${parsed.locality}, ${parsed.province}, España`,
      );
    }
  }

  if (parsed.postalCode && parsed.locality && parsed.province) {
    candidates.add(
      `${parsed.postalCode} ${parsed.locality}, ${parsed.province}, España`,
    );
  }

  if (parsed.locality && parsed.province) {
    candidates.add(`${parsed.locality}, ${parsed.province}, España`);
  }

  return [...candidates].map(normalizeAddressForGeocoding);
}

function extractAddressComponent(
  result: any,
  acceptedTypes: string[],
): string | null {
  const components = Array.isArray(result?.address_components)
    ? result.address_components
    : [];

  for (const component of components) {
    const types = Array.isArray(component?.types) ? component.types : [];
    if (acceptedTypes.some((type) => types.includes(type))) {
      return String(component.long_name || component.short_name || "").trim() || null;
    }
  }

  return null;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 0; i < a.length; i++) {
    let last = i;
    previous[0] = i + 1;

    for (let j = 0; j < b.length; j++) {
      const current = previous[j + 1];
      const substitutionCost = a[i] === b[j] ? 0 : 1;
      previous[j + 1] = Math.min(
        previous[j + 1] + 1,
        previous[j] + 1,
        last + substitutionCost,
      );
      last = current;
    }
  }

  return previous[b.length] ?? 0;
}

function looseLocalityMatch(expected: string, received: string): boolean {
  const left = normalizeComparableText(expected);
  const right = normalizeComparableText(received);

  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  return levenshteinDistance(left, right) <= 2;
}

function isGenericOnlyResult(result: any): boolean {
  const resultTypes: string[] = Array.isArray(result?.types) ? result.types : [];
  const TOO_GENERIC_TYPES = new Set([
    "country",
    "administrative_area_level_1",
    "administrative_area_level_2",
    "administrative_area_level_3",
    "administrative_area_level_4",
    "political",
  ]);

  const hasGranular = resultTypes.some((type) =>
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
    ].includes(type),
  );

  return (
    resultTypes.length > 0 &&
    resultTypes.every((type) => TOO_GENERIC_TYPES.has(type)) &&
    !hasGranular
  );
}

function matchesParsedAddress(result: any, parsed: ParsedAddress): boolean {
  const postalCode = extractAddressComponent(result, ["postal_code"]);
  const locality =
    extractAddressComponent(result, ["locality", "postal_town"]) ??
    extractAddressComponent(result, ["administrative_area_level_3"]);
  const province =
    extractAddressComponent(result, ["administrative_area_level_2"]) ??
    extractAddressComponent(result, ["administrative_area_level_1"]);

  if (parsed.postalCode && postalCode !== parsed.postalCode) {
    return false;
  }

  if (parsed.locality) {
    if (!locality) return false;
    if (!looseLocalityMatch(parsed.locality, locality)) return false;
  }

  if (parsed.province && province) {
    if (!looseLocalityMatch(parsed.province, province)) return false;
  }

  return true;
}

function getResultGranularity(result: any): number {
  const resultTypes: string[] = Array.isArray(result?.types) ? result.types : [];

  if (resultTypes.includes("street_address") || resultTypes.includes("premise")) {
    return 4;
  }

  if (resultTypes.includes("route")) return 3;
  if (resultTypes.includes("postal_code")) return 2;
  if (resultTypes.includes("locality")) return 1;

  return 0;
}

function pickBestMatchingResult(results: any[], parsed: ParsedAddress): any | null {
  const candidates = results
    .filter((result) => !isGenericOnlyResult(result))
    .filter((result) => matchesParsedAddress(result, parsed));

  if (!candidates.length) return null;

  candidates.sort((left, right) => getResultGranularity(right) - getResultGranularity(left));
  return candidates[0] ?? null;
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

async function fetchGoogleGeocodeResults(query: string): Promise<any[]> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
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
        case "OK":
          return Array.isArray(json.results) ? json.results : [];

        case "ZERO_RESULTS":
          return [];

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

  const parsed = parseAddressForGeocoding(normalizedAddress);
  const candidates = buildAddressCandidates(normalizedAddress);

  for (const candidate of candidates) {
    const results = await fetchGoogleGeocodeResults(candidate);
    const first = pickBestMatchingResult(results, parsed);

    if (!first) {
      continue;
    }

    const lat = Number(first?.geometry?.location?.lat);
    const lng = Number(first?.geometry?.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      continue;
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

  return null;
}

export const __test__ = {
  buildAddressCandidates,
  buildStreetLineVariants,
  clearGeocodeCache: () => geocodeCache.clear(),
  looseLocalityMatch,
  matchesParsedAddress,
  parseAddressForGeocoding,
  pickBestMatchingResult,
};
