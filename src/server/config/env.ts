import dotenv from "dotenv";

// Cargamos .env.local primero (convención vite/next: valores locales que
// no se commitean) y luego .env como fallback. `override: false` evita que
// un .env reescriba valores que ya estén en el entorno real (CI/prod).
dotenv.config({ path: ".env.local", override: false });
dotenv.config({ override: false });

export const PORT = Number(process.env.PORT || 3000);

export const SAPIENS_CONTACT_PHONE =
  process.env.SAPIENS_CONTACT_PHONE || "960 99 27 77";

export const SAPIENS_CONTACT_EMAIL =
  process.env.SAPIENS_CONTACT_EMAIL || "info@sapiensenergia.es";

export const SAPIENS_BANK_ACCOUNT_IBAN =
  process.env.SAPIENS_BANK_ACCOUNT_IBAN || "ES7001822339620201642233";

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
export const DEFAULT_SIGNAL_AMOUNT_EUR = Number(
  process.env.DEFAULT_SIGNAL_AMOUNT_EUR || 0.5,
);

if (!STRIPE_SECRET_KEY) {
  throw new Error("Falta STRIPE_SECRET_KEY en .env");
}

if (!STRIPE_WEBHOOK_SECRET) {
  throw new Error("Falta STRIPE_WEBHOOK_SECRET en .env");
}

export const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  process.env.VITE_FRONTEND_URL ||
  `http://localhost:${PORT}`;

export const CONTRACT_RESUME_JWT_SECRET =
  process.env.CONTRACT_RESUME_JWT_SECRET || "";

if (!CONTRACT_RESUME_JWT_SECRET) {
  throw new Error("Falta CONTRACT_RESUME_JWT_SECRET en .env");
}

export const GOOGLE_MAPS_GEOCODING_API_KEY =
  process.env.GOOGLE_MAPS_GEOCODING_API_KEY || "";

if (!GOOGLE_MAPS_GEOCODING_API_KEY) {
  throw new Error("Falta GOOGLE_MAPS_GEOCODING_API_KEY en .env");
}

/**
 * Radio de busqueda de instalaciones alrededor del cliente (metros).
 *
 * Actualmente fijado en 5 km por restriccion legislativa:
 *   - Autoconsumo colectivo con excedentes a traves de red
 *     (RD 244/2019 modificado por el RDL 2019/2024): exige que los consumidores
 *     asociados esten a menos de 5 km de la instalacion de generacion.
 */
export const INSTALLATION_SEARCH_RADIUS_METERS = Number(
  process.env.INSTALLATION_SEARCH_RADIUS_METERS || 5000,
);

if (
  !Number.isFinite(INSTALLATION_SEARCH_RADIUS_METERS) ||
  INSTALLATION_SEARCH_RADIUS_METERS <= 0
) {
  throw new Error(
    `INSTALLATION_SEARCH_RADIUS_METERS debe ser un número positivo. Recibido: "${process.env.INSTALLATION_SEARCH_RADIUS_METERS}"`,
  );
}

export const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";

export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el archivo .env",
  );
}

export const GOOGLE_SERVICE_ACCOUNT_EMAIL =
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";

export const GOOGLE_PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || "")
  .replace(/\\n/g, "\n")
  .replace(/^"|"$/g, "");

export const GOOGLE_DRIVE_ROOT_FOLDER_ID =
  process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || "";

if (
  !GOOGLE_SERVICE_ACCOUNT_EMAIL ||
  !GOOGLE_PRIVATE_KEY ||
  !GOOGLE_DRIVE_ROOT_FOLDER_ID
) {
  throw new Error(
    "Faltan GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY o GOOGLE_DRIVE_ROOT_FOLDER_ID en .env",
  );
}
