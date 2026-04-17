import { Readable } from "node:stream";

import { drive } from "../clients/googleDriveClient";
import { GOOGLE_DRIVE_ROOT_FOLDER_ID } from "../config/env";
import {
  buildClientFolderName,
  escapeDriveQueryValue,
  normalizeDriveToken,
} from "../utils/stringUtils";

export async function downloadDriveFileAsBuffer(fileId: string) {
  const metadata = await drive.files.get({
    fileId,
    fields: "id,name,mimeType",
    supportsAllDrives: true,
  });

  const response = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true,
    },
    {
      responseType: "arraybuffer",
    },
  );

  const fileData = response.data;

  let buffer: Buffer;

  if (Buffer.isBuffer(fileData)) {
    buffer = fileData;
  } else if (fileData instanceof ArrayBuffer) {
    buffer = Buffer.from(fileData);
  } else if (typeof fileData === "string") {
    buffer = Buffer.from(fileData);
  } else {
    buffer = Buffer.from(fileData as any);
  }

  return {
    buffer,
    fileName: metadata.data.name ?? "propuesta.pdf",
    mimeType: metadata.data.mimeType ?? "application/pdf",
  };
}

export async function ensureClientDriveFolder(params: {
  dni: string;
  nombre: string;
  apellidos: string;
}) {
  const folderName = buildClientFolderName(
    params.dni,
    params.nombre,
    params.apellidos,
  );

  const q = [
    `mimeType='application/vnd.google-apps.folder'`,
    `trashed=false`,
    `name='${escapeDriveQueryValue(folderName)}'`,
    `'${GOOGLE_DRIVE_ROOT_FOLDER_ID}' in parents`,
  ].join(" and ");

  const existing = await drive.files.list({
    q,
    pageSize: 1,
    fields: "files(id,name,webViewLink)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const found = existing.data.files?.[0];

  if (found?.id) {
    return {
      id: found.id,
      name: found.name ?? folderName,
      webViewLink:
        found.webViewLink ??
        `https://drive.google.com/drive/folders/${found.id}`,
    };
  }

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [GOOGLE_DRIVE_ROOT_FOLDER_ID],
    },
    fields: "id,name,webViewLink",
    supportsAllDrives: true,
  });

  if (!created.data.id) {
    throw new Error("No se pudo crear la carpeta del cliente en Drive");
  }

  return {
    id: created.data.id,
    name: created.data.name ?? folderName,
    webViewLink:
      created.data.webViewLink ??
      `https://drive.google.com/drive/folders/${created.data.id}`,
  };
}

export async function uploadBufferToDrive(params: {
  folderId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}) {
  const uploaded = await drive.files.create({
    requestBody: {
      name: params.fileName,
      parents: [params.folderId],
    },
    media: {
      mimeType: params.mimeType,
      body: Readable.from(params.buffer),
    },
    fields: "id,name,webViewLink,webContentLink",
    supportsAllDrives: true,
  });

  if (!uploaded.data.id) {
    throw new Error("No se pudo subir el archivo a Google Drive");
  }

  return {
    id: uploaded.data.id,
    name: uploaded.data.name ?? params.fileName,
    webViewLink:
      uploaded.data.webViewLink ??
      `https://drive.google.com/file/d/${uploaded.data.id}/view`,
    webContentLink: uploaded.data.webContentLink ?? null,
  };
}

export type ContractFolderStatus = "PendientesPago" | "Confirmados" | "Expirados";

export function buildContractNumber(studyId: string) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `CT-${date}-${studyId.slice(0, 8).toUpperCase()}`;
}

export function buildContractFileName(params: {
  dni: string;
  nombre: string;
  apellidos: string;
  contractId: string;
}) {
  const date = new Date().toISOString().slice(0, 10);

  return `${normalizeDriveToken(params.dni)}-${normalizeDriveToken(
    params.nombre,
  )}_${normalizeDriveToken(params.apellidos)}-${date}-${params.contractId.slice(
    0,
    8,
  )}.pdf`;
}

async function ensureDriveChildFolder(parentId: string, folderName: string) {
  const q = [
    `mimeType='application/vnd.google-apps.folder'`,
    `trashed=false`,
    `name='${escapeDriveQueryValue(folderName)}'`,
    `'${parentId}' in parents`,
  ].join(" and ");

  const existing = await drive.files.list({
    q,
    pageSize: 1,
    fields: "files(id,name,webViewLink)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const found = existing.data.files?.[0];

  if (found?.id) {
    return {
      id: found.id,
      name: found.name ?? folderName,
      webViewLink:
        found.webViewLink ??
        `https://drive.google.com/drive/folders/${found.id}`,
    };
  }

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id,name,webViewLink",
    supportsAllDrives: true,
  });

  if (!created.data.id) {
    throw new Error(`No se pudo crear la carpeta ${folderName} en Drive`);
  }

  return {
    id: created.data.id,
    name: created.data.name ?? folderName,
    webViewLink:
      created.data.webViewLink ??
      `https://drive.google.com/drive/folders/${created.data.id}`,
  };
}

export async function ensureContractsStatusFolder(status: ContractFolderStatus) {
  const contractsRoot = await ensureDriveChildFolder(
    GOOGLE_DRIVE_ROOT_FOLDER_ID,
    "CONTRATOS",
  );

  const statusFolder = await ensureDriveChildFolder(contractsRoot.id, status);

  return {
    root: contractsRoot,
    folder: statusFolder,
  };
}
