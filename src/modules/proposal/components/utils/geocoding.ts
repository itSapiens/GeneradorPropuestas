import axios from "axios";

export function normalizeAddressForGeocoding(address: string): string {
  return address
    .replace(/\s+/g, " ")
    .replace(/,+/g, ",")
    .replace(/\s*,\s*/g, ", ")
    .trim();
}

export async function geocodeAddress(address: string): Promise<{
  lat: number;
  lng: number;
} | null> {
  const normalizedAddress = normalizeAddressForGeocoding(address);

  if (!normalizedAddress) return null;

  const response = await axios.post("/api/geocode-address", {
    address: normalizedAddress,
  });

  const coords = response.data?.coords;

  if (
    !coords ||
    !Number.isFinite(Number(coords.lat)) ||
    !Number.isFinite(Number(coords.lng))
  ) {
    return null;
  }

  return {
    lat: Number(coords.lat),
    lng: Number(coords.lng),
  };
}