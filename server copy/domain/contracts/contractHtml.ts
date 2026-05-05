import {
  fillTranslationTemplate,
  formatCurrencyByLanguage,
  getContractTexts,
  getLocaleFromLanguage,
  getProposalModeLabel,
  type AppLanguage,
} from "./contractLocalization";
import type { ContractCommercialSummary } from "./contractCommercial";

function formatNumber(value: number, language: AppLanguage, digits = 2) {
  return new Intl.NumberFormat(getLocaleFromLanguage(language), {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function buildBasicContractHtml(params: {
  assignedKwp: number;
  client: any;
  commercial: ContractCommercialSummary;
  contractId: string;
  contractNumber: string;
  installation: any;
  language: AppLanguage;
  proposalMode: "investment" | "service";
  study: any;
}) {
  const texts = getContractTexts(params.language);
  const fullName = `${params.client.nombre} ${params.client.apellidos}`.trim();
  const installationCompany =
    params.installation.empresa ?? params.installation.empresas ?? null;
  const transferConcept = `${fullName || "-"} - ${
    params.contractNumber
  }`;
  const bankAccountIban = params.installation.iban_aportaciones ?? "-";
  const signedDate = new Date().toLocaleDateString(
    getLocaleFromLanguage(params.language),
  );
  const selectedPrice =
    params.commercial.selectedPrice !== null
      ? formatCurrencyByLanguage(
          params.commercial.selectedPrice,
          "EUR",
          params.language,
        )
      : "-";
  const reservationAmount = formatCurrencyByLanguage(
    params.commercial.reservationAmount,
    "EUR",
    params.language,
  );
  const annualMaintenance =
    params.commercial.annualMaintenance > 0
      ? formatCurrencyByLanguage(
          params.commercial.annualMaintenance,
          "EUR",
          params.language,
        )
      : formatCurrencyByLanguage(0, "EUR", params.language);
  const investmentPrice =
    params.commercial.investmentPrice !== null
      ? formatCurrencyByLanguage(
          params.commercial.investmentPrice,
          "EUR",
          params.language,
        )
      : "-";
  const serviceMonthlyFee =
    params.commercial.serviceMonthlyFee !== null
      ? formatCurrencyByLanguage(
          params.commercial.serviceMonthlyFee,
          "EUR",
          params.language,
        )
      : "-";
  const selectedPriceSuffix =
    params.commercial.selectedPriceUnit === "monthly"
      ? texts.perMonth
      : texts.oneTimePayment;
  const availableModes = params.commercial.availableModes
    .map((mode) => getProposalModeLabel(mode, params.language))
    .join(" · ");
  const reservationHelp =
    params.commercial.reservationMode === "fija"
      ? texts.fixedReservationAmount
      : texts.reservationByAssignedPower;
  const annualMaintenanceHelp = fillTranslationTemplate(
    texts.overAssignedPower,
    {
      value: formatNumber(params.assignedKwp, params.language),
    },
  );

  return `
    <!doctype html>
    <html lang="${texts.htmlLang}">
      <head>
        <meta charset="UTF-8" />
        <title>${texts.title} ${params.contractNumber}</title>
        <style>
          @page { size: A4; margin: 0; }
          * { box-sizing: border-box; }
          html, body {
            margin: 0;
            padding: 0;
            background: #eef2ff;
          }
          body {
            font-family: Arial, sans-serif;
            color: #111827;
            line-height: 1.6;
          }
          .page {
            width: 100%;
            max-width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 16mm;
            background: #ffffff;
          }
          .title {
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 8px;
            color: #07005f;
          }
          .subtitle {
            font-size: 14px;
            color: #6b7280;
            margin-bottom: 32px;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
            margin-bottom: 20px;
          }
          .metric {
            border: 1px solid #dbeafe;
            border-radius: 16px;
            padding: 16px 18px;
            background: #f8fbff;
          }
          .metric-label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #6b7280;
            margin-bottom: 6px;
          }
          .metric-value {
            font-size: 21px;
            font-weight: 700;
            color: #07005f;
          }
          .metric-help {
            font-size: 12px;
            color: #4b5563;
            margin-top: 6px;
          }
          .box {
            border: 1px solid #e5e7eb;
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 20px;
          }
          .box h3 {
            margin: 0 0 12px 0;
            color: #07005f;
          }
          .signature {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px dashed #9ca3af;
          }
          .transfer-box {
            background: #eff6ff;
            border-color: #bfdbfe;
          }
          .transfer-box p:last-child {
            margin-bottom: 0;
          }
        </style>
      </head>
      <body>
        <main class="page">
        <div class="title">${texts.title}</div>
        <div class="subtitle">${texts.contractNumber} ${
          params.contractNumber
        } · ${texts.date} ${signedDate}</div>

        <div class="summary-grid">
          <div class="metric">
            <div class="metric-label">${texts.selectedMode}</div>
            <div class="metric-value">${getProposalModeLabel(
              params.proposalMode,
              params.language,
            )}</div>
            <div class="metric-help">${texts.availableModes}: ${availableModes}</div>
          </div>
          <div class="metric">
            <div class="metric-label">${
              params.proposalMode === "service"
                ? texts.selectedServicePrice
                : texts.selectedInvestmentPrice
            }</div>
            <div class="metric-value">${selectedPrice}</div>
            <div class="metric-help">${selectedPriceSuffix}</div>
          </div>
          <div class="metric">
            <div class="metric-label">${texts.reservation}</div>
            <div class="metric-value">${reservationAmount}</div>
            <div class="metric-help">${reservationHelp}</div>
          </div>
          <div class="metric">
            <div class="metric-label">${texts.annualMaintenance}</div>
            <div class="metric-value">${annualMaintenance}</div>
            <div class="metric-help">${annualMaintenanceHelp}</div>
          </div>
        </div>

        <div class="box">
          <h3>${texts.clientData}</h3>
          <p><strong>${texts.name}:</strong> ${fullName}</p>
          <p><strong>${texts.dni}:</strong> ${params.client.dni}</p>
          <p><strong>${texts.email}:</strong> ${params.client.email ?? "-"}</p>
          <p><strong>${texts.phone}:</strong> ${params.client.telefono ?? "-"}</p>
          <p><strong>${texts.address}:</strong> ${
            params.client.direccion_completa ?? "-"
          }</p>
        </div>

        <div class="box">
          <h3>${texts.installationData}</h3>
          <p><strong>${texts.installation}:</strong> ${
            params.installation.nombre_instalacion ?? "-"
          }</p>
          <p><strong>${texts.address}:</strong> ${
            params.installation.direccion ?? "-"
          }</p>
          <p><strong>${texts.company}:</strong> ${
            installationCompany?.nombre ?? "-"
          } <strong>${texts.taxId}:</strong> ${
            installationCompany?.cif ?? "-"
          }</p>

          <p><strong>${texts.mode}:</strong> ${getProposalModeLabel(
            params.proposalMode,
            params.language,
          )}</p>
          <p><strong>${texts.assignedKwp}:</strong> ${params.assignedKwp ?? "-"}</p>
          <p><strong>${texts.investmentPrice}:</strong> ${investmentPrice}</p>
          <p><strong>${texts.servicePrice}:</strong> ${serviceMonthlyFee}${
            serviceMonthlyFee !== "-" ? ` ${texts.perMonth}` : ""
          }</p>
          <p><strong>${texts.reservation}:</strong> ${reservationAmount}</p>
          <p><strong>${texts.annualMaintenance}:</strong> ${annualMaintenance}</p>
          <p><strong>${texts.installedPower}:</strong> ${
            params.installation.potencia_instalada_kwp ?? "-"
          } kWp</p>
          <p><strong>${texts.battery}:</strong> ${
            params.installation.almacenamiento_kwh ?? "-"
          } kWh</p>
          <p><strong>${texts.effectiveHours}:</strong> ${
            params.installation.horas_efectivas ?? "-"
          } h/año</p>
          <p><strong>${texts.estimatedSelfConsumption}:</strong> ${
            params.installation.porcentaje_autoconsumo ?? "-"
          }%</p>
        </div>

        <div class="box">
          <h3>${texts.basicConditions}</h3>
          <p>${texts.condition1}</p>
          <p>${texts.condition2}</p>
          <p>${texts.condition3}</p>
        </div>

        <div class="box transfer-box">
          <h3>${texts.transferInstructionsTitle}</h3>
          <p>${texts.transferInstructionsDescription}</p>
          <p><strong>${texts.transferIban}:</strong> ${bankAccountIban}</p>
          <p><strong>${texts.transferConcept}:</strong> ${transferConcept}</p>
        </div>

        <div class="signature">
          <p><strong>${texts.clientSignature}:</strong></p>
          <div style="height: 80px;"></div>
        </div>
        </main>
      </body>
    </html>
  `;
}
