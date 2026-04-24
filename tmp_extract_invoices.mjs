import fs from "fs";
import path from "path";
import { extractTextFromDocument } from "./src/server/infrastructure/external/extraction/documentTextExtractionService.ts";

const files = [
  "C:/Users/fllor/Downloads/factura (1).pdf",
  "C:/Users/fllor/Downloads/factura (2).pdf",
];

for (const file of files) {
  const buffer = fs.readFileSync(file);
  const result = await extractTextFromDocument({ buffer, mimeType: "application/pdf", fileName: path.basename(file) });
  console.log("FILE:", file);
  console.log("METHOD:", result.method);
  console.log("WARNINGS:", result.warnings);
  console.log(result.text.slice(0, 6000));
  console.log("\n=== END FILE ===\n");
}
