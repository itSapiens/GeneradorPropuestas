import { readFile } from 'node:fs/promises';
import { extractText, getDocumentProxy } from 'unpdf';
const files = [
  'D:/SAPIENS/calculadora/testFiles/Factura Num FE26137002424873 2.pdf',
  'D:/SAPIENS/calculadora/testFiles/factura.pdf',
  'D:/SAPIENS/calculadora/testFiles/factura_luz_ejemplo_completa.pdf',
  'D:/SAPIENS/calculadora/testFiles/ilovepdf_merged.pdf',
  'D:/SAPIENS/calculadora/testFiles/batoi.pdf',
];
for (const file of files) {
  const data = await readFile(file);
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  console.log('\n===== ' + file + ' =====');
  console.log('PAGES', totalPages, 'TEXT_LEN', text.length);
  console.log(text.slice(0, 8000));
}
