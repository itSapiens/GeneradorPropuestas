import {
  fillTranslationTemplate,
  formatCurrencyByLanguage,
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

function formatNumber(value: number, language: AppLanguage, digits = 2) {
  return new Intl.NumberFormat(getLocaleFromLanguage(language), {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
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
  const commercial = preview.commercial ?? null;
  const reservationAmount = commercial
    ? formatCurrencyByLanguage(commercial.reservationAmount, "EUR", params.language)
    : "-";
  const annualMaintenance = commercial
    ? formatCurrencyByLanguage(commercial.annualMaintenance ?? 0, "EUR", params.language)
    : "-";
  const selectedPrice =
    commercial?.selectedPrice != null
      ? formatCurrencyByLanguage(commercial.selectedPrice, "EUR", params.language)
      : "-";
  const selectedUnit =
    commercial?.selectedPriceUnit === "monthly"
      ? texts.perMonth
      : texts.oneTimePayment;
  const selectedModeLabel = getProposalModeLabel(preview.proposalMode, params.language);
  const selectedInstallationPriceLine =
    preview.proposalMode === "service"
      ? `<p><strong>${escapeHtml(texts.servicePrice)}:</strong> ${escapeHtml(selectedPrice)}${selectedPrice !== "-" ? ` ${escapeHtml(texts.perMonth)}` : ""}</p>`
      : `<p><strong>${escapeHtml(texts.investmentPrice)}:</strong> ${escapeHtml(selectedPrice)}</p>`;
  const assignedKwpLabel = formatNumber(
    Number(preview.assignedKwp ?? 0),
    params.language,
  );
  const reservationHelp =
    commercial?.reservationMode === "fija"
      ? texts.fixedReservationAmount
      : texts.reservationByAssignedPower;
  const annualMaintenanceHelp = fillTranslationTemplate(
    texts.overAssignedPower,
    { value: assignedKwpLabel },
  );

  return `<!doctype html>
<html lang="${texts.htmlLang}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(texts.title)} ${escapeHtml(contractNumber)}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    body {
      background: #ffffff;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10.5px;
      line-height: 1.38;
      margin: 0;
    }
    .page {
      width: 100%;
      max-width: 210mm;
      min-height: 297mm;
      padding: 10mm 11mm 8mm;
    }
    h1 {
      color: #07005f;
      font-size: 22px;
      line-height: 1.1;
      margin: 0 0 4px;
    }
    .subtitle {
      color: #6b7280;
      font-size: 10px;
      margin-bottom: 10px;
    }
    .box {
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      margin-bottom: 8px;
      padding: 9px 10px;
    }
    .summary-grid {
      display: grid;
      gap: 7px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-bottom: 8px;
    }
    .metric {
      background: #f8fbff;
      border: 1px solid #dbeafe;
      border-radius: 10px;
      padding: 8px 10px;
    }
    .metric-label {
      color: #6b7280;
      font-size: 8px;
      letter-spacing: 0.08em;
      margin-bottom: 3px;
      text-transform: uppercase;
    }
    .metric-value {
      color: #07005f;
      font-size: 15px;
      font-weight: 700;
    }
    .metric-help {
      color: #4b5563;
      font-size: 9px;
      margin-top: 2px;
    }
    h2 {
      color: #07005f;
      font-size: 12px;
      margin: 0 0 6px;
    }
    p { margin: 0 0 3px; }
    p:last-child { margin-bottom: 0; }
    .transfer { background: #eff6ff; border-color: #bfdbfe; }
    .signature {
      border-top: 1px dashed #9ca3af;
      margin-top: 10px;
      padding-top: 8px;
    }
    .signature img {
      display: block;
      height: 56px;
      margin-top: 6px;
      object-fit: contain;
      width: 180px;
    }
  </style>
</head>
<body>
  <main class="page">
    <h1>${escapeHtml(texts.title)}</h1>
    <div class="subtitle">${escapeHtml(texts.contractNumber)} ${escapeHtml(contractNumber)} · ${escapeHtml(texts.date)} ${escapeHtml(signedDate)}</div>

    <section class="summary-grid">
      <div class="metric">
        <div class="metric-label">${escapeHtml(texts.selectedMode)}</div>
        <div class="metric-value">${escapeHtml(selectedModeLabel)}</div>
        <div class="metric-help">${escapeHtml(texts.mode)}</div>
      </div>
      <div class="metric">
        <div class="metric-label">${escapeHtml(preview.proposalMode === "service" ? texts.selectedServicePrice : texts.selectedInvestmentPrice)}</div>
        <div class="metric-value">${escapeHtml(selectedPrice)}</div>
        <div class="metric-help">${escapeHtml(selectedUnit)}</div>
      </div>
      <div class="metric">
        <div class="metric-label">${escapeHtml(texts.reservation)}</div>
        <div class="metric-value">${escapeHtml(reservationAmount)}</div>
        <div class="metric-help">${escapeHtml(reservationHelp)}</div>
      </div>
      <div class="metric">
        <div class="metric-label">${escapeHtml(texts.annualMaintenance)}</div>
        <div class="metric-value">${escapeHtml(annualMaintenance)}</div>
        <div class="metric-help">${escapeHtml(annualMaintenanceHelp)}</div>
      </div>
    </section>

    <section class="box">
      <h2>${escapeHtml(texts.clientData)}</h2>
      <p><strong>${escapeHtml(texts.name)}:</strong> ${escapeHtml(fullName)}</p>
      <p><strong>${escapeHtml(texts.dni)}:</strong> ${escapeHtml(client.dni ?? "-")}</p>
      <p><strong>${escapeHtml(texts.email)}:</strong> ${escapeHtml(client.email ?? "-")}</p>
      <p><strong>${escapeHtml(texts.phone)}:</strong> ${escapeHtml(client.telefono ?? "-")}</p>
      <p><strong>${escapeHtml(texts.address)}:</strong> ${escapeHtml(client.direccion_completa ?? client.address ?? "-")}</p>
    </section>

    <section class="box">
      <h2>${escapeHtml(texts.installationData)}</h2>
      <p><strong>${escapeHtml(texts.installation)}:</strong> ${escapeHtml(installation.nombre_instalacion ?? "-")}</p>
      <p><strong>${escapeHtml(texts.address)}:</strong> ${escapeHtml(installation.direccion ?? "-")}</p>
      <p><strong>${escapeHtml(texts.company)}:</strong> ${escapeHtml(company?.nombre ?? "-")}</p>
      <p><strong>${escapeHtml(texts.taxId)}:</strong> ${escapeHtml(company?.cif ?? "-")}</p>
      <p><strong>${escapeHtml(texts.mode)}:</strong> ${escapeHtml(getProposalModeLabel(preview.proposalMode, params.language))}</p>
      <p><strong>${escapeHtml(texts.assignedKwp)}:</strong> ${escapeHtml(preview.assignedKwp ?? "-")}</p>
      ${selectedInstallationPriceLine}
      <p><strong>${escapeHtml(texts.reservation)}:</strong> ${escapeHtml(reservationAmount)}</p>
      <p><strong>${escapeHtml(texts.annualMaintenance)}:</strong> ${escapeHtml(annualMaintenance)}</p>
    </section>

    ${(() => {
      const ec = preview.extraConsumption;
      if (!ec || (!ec.hvac && !ec.ev)) return "";
      const items: string[] = [];
      if (ec.ev) items.push(`${escapeHtml(texts.extraConsumptionEv)}${ec.evAnnualKm ? ` (${escapeHtml(String(ec.evAnnualKm))} ${escapeHtml(texts.extraConsumptionEvKm)})` : ""}`);
      if (ec.hvac) items.push(`${escapeHtml(texts.extraConsumptionHvac)}${ec.hvacSquareMeters ? ` (${escapeHtml(String(ec.hvacSquareMeters))} ${escapeHtml(texts.extraConsumptionHvacM2)})` : ""}`);
      return `<section class="box"><h2>${escapeHtml(texts.extraConsumption)}</h2><p>${items.join(", ")}</p></section>`;
    })()}

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
