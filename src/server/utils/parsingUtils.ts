export function toNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "1", "yes", "si", "sí"].includes(value.toLowerCase());
  }
  return false;
}

export function parseMaybeJson<T = any>(value: unknown): T | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object") return value as T;
  if (typeof value !== "string") return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function toPositiveNumber(value: unknown): number | null {
  const parsed = toNullableNumber(value);
  if (parsed === null) return null;
  return parsed > 0 ? parsed : null;
}
