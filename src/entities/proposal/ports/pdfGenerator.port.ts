export interface PdfGeneratorPort {
  generate(payload: unknown): Promise<Blob>;
}
