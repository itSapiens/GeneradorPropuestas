import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", override: false });
dotenv.config({ override: false });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucketName =
  process.env.SUPABASE_DOCUMENTS_BUCKET || "generador-propuestas-documentos";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const { data: existing, error: getError } =
  await supabase.storage.getBucket(bucketName);

if (existing && !getError) {
  console.log(`Bucket ya existe: ${bucketName}`);
} else {
  const { error: createError } = await supabase.storage.createBucket(bucketName, {
    public: false,
  });

  if (
    createError &&
    !createError.message.toLowerCase().includes("already exists")
  ) {
    throw createError;
  }

  console.log(`Bucket privado preparado: ${bucketName}`);
}
