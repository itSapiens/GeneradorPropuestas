import {
  getContractTexts,
  getLocaleFromLanguage,
  getProposalModeLabel,
  type AppLanguage,
} from "./contractLocalization";

export function buildBasicContractHtml(params: {
  assignedKwp: number;
  client: any;
  contractId: string;
  contractNumber: string;
  installation: any;
  language: AppLanguage;
  proposalMode: "investment" | "service";
  study: any;
}) {
  const texts = getContractTexts(params.language);
  const fullName = `${params.client.nombre} ${params.client.apellidos}`.trim();
  const transferConcept = `DNI ${params.client.dni ?? "-"} - ${
    params.contractNumber
  }`;
  const bankAccountIban = params.installation.iban_aportaciones ?? "-";
  const signedDate = new Date().toLocaleDateString(
    getLocaleFromLanguage(params.language),
  );

  return `
    <!doctype html>
    <html lang="${texts.htmlLang}">
      <head>
        <meta charset="UTF-8" />
        <title>${texts.title} ${params.contractNumber}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #111827;
            padding: 40px;
            line-height: 1.6;
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
        <div class="title">${texts.title}</div>
        <div class="subtitle">${texts.contractNumber} ${
          params.contractNumber
        } · ${texts.date} ${signedDate}</div>

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
          <p><strong>${texts.mode}:</strong> ${getProposalModeLabel(
            params.proposalMode,
            params.language,
          )}</p>
          <p><strong>${texts.assignedKwp}:</strong> ${params.assignedKwp ?? "-"}</p>
          <p><strong>Potencia instalada:</strong> ${
            params.installation.potencia_instalada_kwp ?? "-"
          } kWp</p>
          <p><strong>Batería:</strong> ${
            params.installation.almacenamiento_kwh ?? "-"
          } kWh</p>
          <p><strong>Horas efectivas:</strong> ${
            params.installation.horas_efectivas ?? "-"
          } h/año</p>
          <p><strong>Autoconsumo estimado:</strong> ${
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
      </body>
    </html>
  `;
}
