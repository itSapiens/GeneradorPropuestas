import { supabase } from "../../clients/supabaseClient";
import { SUPABASE_DOCUMENTS_BUCKET } from "../../config/env";

function normalizeStorageToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function normalizeStorageSegment(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function getReadableDocumentName(fileName: string) {
  switch (fileName) {
    case "factura.pdf":
      return "Factura.pdf";
    case "propuesta.pdf":
      return "Propuesta.pdf";
    case "contrato-firmado.pdf":
      return "ContratoFirmado.pdf";
    default:
      return normalizeStorageSegment(fileName) || "Documento.pdf";
  }
}

export function buildClientStorageFolderPath(params: {
  apellidos: string;
  dni: string;
  nombre: string;
}) {
  const nameToken = normalizeStorageToken(
    `${params.nombre} ${params.apellidos}`,
  );
  const dniToken = normalizeStorageToken(params.dni);

  return `clients/${nameToken}-${dniToken}`;
}

let bucketReadyPromise: Promise<void> | null = null;

async function ensureDocumentsBucket() {
  if (!bucketReadyPromise) {
    bucketReadyPromise = (async () => {
      const { data: existing, error: getError } =
        await supabase.storage.getBucket(SUPABASE_DOCUMENTS_BUCKET);

      if (existing && !getError) {
        return;
      }

      const { error: createError } = await supabase.storage.createBucket(
        SUPABASE_DOCUMENTS_BUCKET,
        {
          public: false,
        },
      );

      if (
        createError &&
        !createError.message.toLowerCase().includes("already exists")
      ) {
        throw new Error(
          `No se pudo crear el bucket de documentos en Supabase: ${createError.message}`,
        );
      }
    })();
  }

  return bucketReadyPromise;
}

export async function uploadClientDocumentToSupabase(params: {
  apellidos: string;
  buffer: Buffer;
  documentSetId?: string | null;
  dni: string;
  fileName: "factura.pdf" | "propuesta.pdf" | "contrato-firmado.pdf";
  mimeType: string;
  nombre: string;
}) {
  await ensureDocumentsBucket();

  const folderPath = buildClientStorageFolderPath(params);
  const uniqueName = getReadableDocumentName(params.fileName);
  const documentSetToken = params.documentSetId
    ? normalizeStorageSegment(params.documentSetId)
    : null;
  const documentsFolder = documentSetToken
    ? `${folderPath}/${documentSetToken}`
    : `${folderPath}/documents`;
  const path = `${documentsFolder}/${uniqueName}`;
  const { error } = await supabase.storage
    .from(SUPABASE_DOCUMENTS_BUCKET)
    .upload(path, params.buffer, {
      contentType: params.mimeType || "application/pdf",
      upsert: false,
    });

  if (error) {
    throw new Error(`No se pudo subir ${params.fileName} a Supabase: ${error.message}`);
  }

  return {
    bucket: SUPABASE_DOCUMENTS_BUCKET,
    fileName: params.fileName,
    folderPath,
    mimeType: params.mimeType || "application/pdf",
    path,
  };
}

export async function downloadSupabaseDocumentAsBuffer(params: {
  bucket?: string | null;
  path: string;
}) {
  const bucket = params.bucket || SUPABASE_DOCUMENTS_BUCKET;
  const { data, error } = await supabase.storage.from(bucket).download(params.path);

  if (error || !data) {
    throw new Error(
      `No se pudo descargar el archivo de Supabase Storage: ${
        error?.message || "archivo no encontrado"
      }`,
    );
  }

  const arrayBuffer = await data.arrayBuffer();
  const fileName = params.path.split("/").pop() || "documento.pdf";

  return {
    buffer: Buffer.from(arrayBuffer),
    fileName,
    mimeType: data.type || "application/pdf",
  };
}
