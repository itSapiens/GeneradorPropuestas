import {
  getContractTexts,
  getLocaleFromLanguage,
  getProposalModeLabel,
  type AppLanguage,
} from "./contractLocalization";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeDataUrl(value: unknown): string {
  const dataUrl = String(value || "");
  return dataUrl.startsWith("data:image/") ? dataUrl : "";
}

export function buildSignedContractPdfHtml(params: {
  language: AppLanguage;
  preview: any;
  signatureDataUrl: string;
}) {
  const texts = getContractTexts(params.language);
  const preview = params.preview ?? {};
  const client = preview.client ?? {};
  const installation = preview.installation ?? {};
  const company = installation.empresa ?? null;
  const fullName = `${client.nombre ?? ""} ${client.apellidos ?? ""}`.trim();
  const contractNumber = preview.contractNumber ?? "-";
  const signedDate = new Date().toLocaleDateString(
    getLocaleFromLanguage(params.language),
  );
  const transferConcept = `${fullName || "-"} - ${contractNumber}`;

  return `<!doctype html>
<html lang="${texts.htmlLang}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(texts.title)} ${escapeHtml(contractNumber)}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body {
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.55;
      margin: 0;
    }
    .page {
      min-height: 297mm;
      padding: 18mm;
    }
    h1 {
      color: #07005f;
      font-size: 28px;
      line-height: 1.1;
      margin: 0 0 6px;
    }
    .subtitle {
      color: #6b7280;
      margin-bottom: 24px;
    }
    .box {
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      margin-bottom: 14px;
      padding: 14px 16px;
    }
    h2 {
      color: #07005f;
      font-size: 16px;
      margin: 0 0 10px;
    }
    p { margin: 0 0 7px; }
    p:last-child { margin-bottom: 0; }
    .transfer { background: #eff6ff; border-color: #bfdbfe; }
    .signature {
      border-top: 1px dashed #9ca3af;
      margin-top: 28px;
      padding-top: 16px;
    }
    .signature img {
      display: block;
      height: 92px;
      margin-top: 8px;
      object-fit: contain;
      width: 240px;
    }
  </style>
</head>
<body>
  <main class="page">
    <h1>${escapeHtml(texts.title)}</h1>
    <div class="subtitle">${escapeHtml(texts.contractNumber)} ${escapeHtml(contractNumber)} · ${escapeHtml(texts.date)} ${escapeHtml(signedDate)}</div>

    <section class="box">
      <h2>${escapeHtml(texts.clientData)}</h2>
      <p><strong>${escapeHtml(texts.name)}:</strong> ${escapeHtml(fullName)}</p>
      <p><strong>${escapeHtml(texts.dni)}:</strong> ${escapeHtml(client.dni ?? "-")}</p>
      <p><strong>${escapeHtml(texts.email)}:</strong> ${escapeHtml(client.email ?? "-")}</p>
      <p><strong>${escapeHtml(texts.phone)}:</strong> ${escapeHtml(client.telefono ?? "-")}</p>
    </section>

    <section class="box">
      <h2>${escapeHtml(texts.installationData)}</h2>
      <p><strong>${escapeHtml(texts.installation)}:</strong> ${escapeHtml(installation.nombre_instalacion ?? "-")}</p>
      <p><strong>${escapeHtml(texts.address)}:</strong> ${escapeHtml(installation.direccion ?? "-")}</p>
      <p><strong>${escapeHtml(texts.company)}:</strong> ${escapeHtml(company?.nombre ?? "-")} <strong>${escapeHtml(texts.taxId)}:</strong> ${escapeHtml(company?.cif ?? "-")}</p>
      <p><strong>${escapeHtml(texts.mode)}:</strong> ${escapeHtml(getProposalModeLabel(preview.proposalMode, params.language))}</p>
      <p><strong>${escapeHtml(texts.assignedKwp)}:</strong> ${escapeHtml(preview.assignedKwp ?? "-")}</p>
      <p><strong>Potencia instalada:</strong> ${escapeHtml(installation.potencia_instalada_kwp ?? "-")} kWp</p>
      <p><strong>Batería:</strong> ${escapeHtml(installation.almacenamiento_kwh ?? "-")} kWh</p>
      <p><strong>Horas efectivas:</strong> ${escapeHtml(installation.horas_efectivas ?? "-")} h/año</p>
      <p><strong>Autoconsumo estimado:</strong> ${escapeHtml(installation.porcentaje_autoconsumo ?? "-")}%</p>
    </section>

    <section class="box">
      <h2>${escapeHtml(texts.basicConditions)}</h2>
      <p>${escapeHtml(texts.condition1)}</p>
      <p>${escapeHtml(texts.condition2)}</p>
      <p>${escapeHtml(texts.condition3)}</p>
    </section>

    <section class="box transfer">
      <h2>${escapeHtml(texts.transferInstructionsTitle)}</h2>
      <p>${escapeHtml(texts.transferInstructionsDescription)}</p>
      <p><strong>${escapeHtml(texts.transferIban)}:</strong> ${escapeHtml(installation.iban_aportaciones ?? "-")}</p>
      <p><strong>${escapeHtml(texts.transferConcept)}:</strong> ${escapeHtml(transferConcept)}</p>
    </section>

    <section class="signature">
      <p><strong>${escapeHtml(texts.clientSignature)}:</strong></p>
      <img src="${escapeHtml(safeDataUrl(params.signatureDataUrl))}" alt="Firma del cliente" />
    </section>
  </main>
</body>
</html>`;
}
