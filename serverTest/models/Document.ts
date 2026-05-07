export type DocumentType = "factura_original" | "estudio_pdf" | string;

export interface StoredDocumentData {
  type: DocumentType;
  provider?: string;
  fileName: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  driveFileId?: string;
  driveFolderId?: string;
  supabaseBucket?: string;
  supabaseFolderPath?: string;
  supabasePath?: string;
  webViewLink?: string;
  webContentLink?: string;
  status?: string;
}
