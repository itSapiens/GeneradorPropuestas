import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { downloadDriveFileAsBuffer } from "../src/server/infrastructure/external/drive/driveStorageService";
import { uploadClientDocumentToSupabase } from "../src/server/infrastructure/external/storage/supabaseDocumentStorageService";
import { pickFirstString } from "../src/server/utils/stringUtils";

dotenv.config({ path: ".env.local", override: false });
dotenv.config({ override: false });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);
const args = new Set(process.argv.slice(2));
const runClients = !args.has("--contracts-only") && !args.has("--studies-only");
const runStudies = !args.has("--clients-only") && !args.has("--contracts-only");
const runContracts = !args.has("--clients-only") && !args.has("--studies-only");

type ClientIdentity = {
  apellidos: string;
  dni: string;
  id?: string;
  nombre: string;
};

function identityFromClient(client: any): ClientIdentity | null {
  const dni = pickFirstString(client?.dni);
  const nombre = pickFirstString(client?.nombre);
  const apellidos = pickFirstString(client?.apellidos);

  if (!dni || !nombre || !apellidos) return null;

  return {
    apellidos,
    dni,
    id: client.id,
    nombre,
  };
}

async function migrateDriveFile(params: {
  driveFileId?: string | null;
  fileName: "factura.pdf" | "propuesta.pdf" | "contrato-firmado.pdf";
  identity: ClientIdentity;
}) {
  if (!params.driveFileId) return null;

  try {
    const driveFile = await downloadDriveFileAsBuffer(params.driveFileId);

    return await uploadClientDocumentToSupabase({
      apellidos: params.identity.apellidos,
      buffer: driveFile.buffer,
      dni: params.identity.dni,
      fileName: params.fileName,
      mimeType: driveFile.mimeType || "application/pdf",
      nombre: params.identity.nombre,
    });
  } catch (error: any) {
    console.warn(
      `No se pudo migrar ${params.fileName} para ${params.identity.dni}: ${
        error?.message || "error desconocido"
      }`,
    );
    return null;
  }
}

async function migrateClients() {
  const { data: clients, error } = await supabase
    .from("clients")
    .select(
      "id,dni,nombre,apellidos,factura_drive_file_id,propuesta_drive_file_id",
    );

  if (error) throw error;

  let migrated = 0;

  for (const client of clients ?? []) {
    const identity = identityFromClient(client);
    if (!identity) continue;

    const invoice = await migrateDriveFile({
      driveFileId: client.factura_drive_file_id,
      fileName: "factura.pdf",
      identity,
    });
    const proposal = await migrateDriveFile({
      driveFileId: client.propuesta_drive_file_id,
      fileName: "propuesta.pdf",
      identity,
    });

    if (!invoice && !proposal) continue;

    const { error: updateError } = await supabase
      .from("clients")
      .update({
        documentos_supabase_bucket: invoice?.bucket ?? proposal?.bucket ?? null,
        factura_supabase_path: invoice?.path ?? null,
        propuesta_supabase_path: proposal?.path ?? null,
        supabase_folder_path: invoice?.folderPath ?? proposal?.folderPath ?? null,
      })
      .eq("id", client.id);

    if (updateError) throw updateError;
    migrated += 1;
    console.log(`Cliente migrado: ${identity.dni}`);
  }

  console.log(`Clientes actualizados: ${migrated}`);
}

async function migrateStudies() {
  const { data: studies, error } = await supabase
    .from("studies")
    .select("id,customer,source_file");

  if (error) throw error;

  let migrated = 0;

  for (const study of studies ?? []) {
    const sourceFile = study.source_file ?? {};
    const identity = identityFromClient(study.customer ?? {});
    if (!identity) continue;

    const invoice = await migrateDriveFile({
      driveFileId: pickFirstString(
        sourceFile.invoice_drive_file_id,
        sourceFile.factura_drive_file_id,
      ),
      fileName: "factura.pdf",
      identity,
    });
    const proposal = await migrateDriveFile({
      driveFileId: pickFirstString(
        sourceFile.proposal_drive_file_id,
        sourceFile.propuesta_drive_file_id,
      ),
      fileName: "propuesta.pdf",
      identity,
    });

    if (!invoice && !proposal) continue;

    const { error: updateError } = await supabase
      .from("studies")
      .update({
        source_file: {
          ...sourceFile,
          documentos_supabase_bucket: invoice?.bucket ?? proposal?.bucket ?? null,
          factura_supabase_path: invoice?.path ?? null,
          propuesta_supabase_path: proposal?.path ?? null,
          supabase_folder_path:
            invoice?.folderPath ?? proposal?.folderPath ?? null,
        },
      })
      .eq("id", study.id);

    if (updateError) throw updateError;
    migrated += 1;
    console.log(`Estudio migrado: ${study.id}`);
  }

  console.log(`Estudios actualizados: ${migrated}`);
}

async function migrateContracts() {
  const { data: contracts, error } = await supabase
    .from("contracts")
    .select("id,client_id,contract_drive_file_id");

  if (error) throw error;

  let migrated = 0;

  for (const contract of contracts ?? []) {
    if (!contract.contract_drive_file_id || !contract.client_id) continue;

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id,dni,nombre,apellidos")
      .eq("id", contract.client_id)
      .maybeSingle();

    if (clientError) throw clientError;

    const identity = identityFromClient(client);
    if (!identity) continue;

    const signedContract = await migrateDriveFile({
      driveFileId: contract.contract_drive_file_id,
      fileName: "contrato-firmado.pdf",
      identity,
    });

    if (!signedContract) continue;

    const { error: updateError } = await supabase
      .from("contracts")
      .update({
        contract_supabase_bucket: signedContract.bucket,
        contract_supabase_path: signedContract.path,
        supabase_folder_path: signedContract.folderPath,
      })
      .eq("id", contract.id);

    if (updateError) throw updateError;
    migrated += 1;
    console.log(`Contrato migrado: ${contract.id}`);
  }

  console.log(`Contratos actualizados: ${migrated}`);
}

if (runClients) {
  await migrateClients();
}

if (runStudies) {
  await migrateStudies();
}

if (runContracts) {
  await migrateContracts();
}

console.log("Migración de Drive a Supabase finalizada.");
