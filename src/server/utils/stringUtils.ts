export function normalizeDriveToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s_-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .toUpperCase();
}

export function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function buildClientFolderName(
  dni: string,
  nombre: string,
  apellidos: string,
): string {
  return `${normalizeDriveToken(dni)}-${normalizeDriveToken(
    nombre,
  )}_${normalizeDriveToken(apellidos)}`;
}

export function pickFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

export function normalizeCups(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  return normalized || null;
}

export function isValidCupsFormat(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Z]{2}[0-9]{16}[A-Z]{2}([0-9][FPCR])?$/i.test(value)
  );
}
