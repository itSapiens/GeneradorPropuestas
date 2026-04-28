import { BillData } from "@/src/lib/validators";
import { CalculationResult } from "@/src/modules/calculation/energyService";
import { generateStudyPDF, ProposalPdfSummary } from "@/src/modules/pdf/pdfService";
import { ApiInstallation, AppLanguage, ProposalCardData } from "../types/proposal.types";
import { TFunction } from "i18next";
import { getAvailableProposalModes, normalizeInstallationModalidad } from "./proposalModes";
import { buildProposalCardData } from "./proposalCard";

export type PdfArtifact =
  | Blob
  | Uint8Array
  | ArrayBuffer
  | {
      save: (fileName?: string) => void;
      output?: (type?: string) => unknown;
    }
  | null
  | undefined;


export  function isBlob(value: unknown): value is Blob {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

export function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer;
}

export function isUint8Array(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array;
}


export function hasSaveMethod(value: unknown): value is {
  save: (fileName?: string) => void;
  output?: (type?: string) => unknown;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "save" in value &&
    typeof (value as { save?: unknown }).save === "function"
  );
}


export function uint8ArrayToArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(
    value.byteOffset,
    value.byteOffset + value.byteLength,
  ) as ArrayBuffer;
}

export const buildPdfArtifact = async (
  billData: BillData,
  calculationResult: CalculationResult,
  proposals: ProposalPdfSummary[],
  language: AppLanguage,
): Promise<PdfArtifact> => {
  const result = await generateStudyPDF(
    billData,
    calculationResult,
    proposals,
    language,
  );
  return result as PdfArtifact;
};


function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function savePdfArtifactLocally(pdfArtifact: PdfArtifact, fileName: string) {
  if (!pdfArtifact) {
    throw new Error("No se pudo generar el PDF");
  }

  if (hasSaveMethod(pdfArtifact)) {
    pdfArtifact.save(fileName);
    return;
  }

  if (isBlob(pdfArtifact)) {
    downloadBlob(pdfArtifact, fileName);
    return;
  }

  if (isUint8Array(pdfArtifact)) {
    const buffer = uint8ArrayToArrayBuffer(pdfArtifact);
    downloadBlob(new Blob([buffer], { type: "application/pdf" }), fileName);
    return;
  }

  if (isArrayBuffer(pdfArtifact)) {
    downloadBlob(
      new Blob([pdfArtifact], { type: "application/pdf" }),
      fileName,
    );
    return;
  }

  throw new Error("Formato de PDF no soportado");
}

export function pdfArtifactToBlob(pdfArtifact: PdfArtifact): Blob {
  if (!pdfArtifact) {
    throw new Error("No se pudo generar el PDF");
  }

  if (isBlob(pdfArtifact)) {
    return pdfArtifact;
  }

  if (isUint8Array(pdfArtifact)) {
    const buffer = uint8ArrayToArrayBuffer(pdfArtifact);
    return new Blob([buffer], { type: "application/pdf" });
  }

  if (isArrayBuffer(pdfArtifact)) {
    return new Blob([pdfArtifact], { type: "application/pdf" });
  }

  if (hasSaveMethod(pdfArtifact) && typeof pdfArtifact.output === "function") {
    const output = pdfArtifact.output("blob");

    if (output instanceof Blob) {
      return output;
    }

    if (output instanceof Uint8Array) {
      const buffer = uint8ArrayToArrayBuffer(output);
      return new Blob([buffer], { type: "application/pdf" });
    }

    if (output instanceof ArrayBuffer) {
      return new Blob([output], { type: "application/pdf" });
    }
  }

  throw new Error("Formato de PDF no soportado");
}


export function buildProposalPdfSummary(
  proposal: ProposalCardData,
  installation?: ApiInstallation | null,
): ProposalPdfSummary {
  return {
    mode: proposal.id,
    title: proposal.title,
    badge: proposal.badge,
    annualSavings: proposal.annualSavings,
    totalSavings25Years: proposal.totalSavings25Years,
    upfrontCost: proposal.upfrontCost,
    monthlyFee: proposal.monthlyFee,
    annualMaintenance: proposal.annualMaintenance,
    paybackYears: proposal.paybackYears,
    recommendedPowerKwp: proposal.recommendedPowerKwp,
    annualConsumptionKwh: proposal.annualConsumptionKwh,
    description: proposal.description,
    installationAddress: installation?.direccion ?? null,
    installationName: installation?.nombre_instalacion ?? null,
  };
}

export function buildProposalPdfSummariesForInstallation(
  result: CalculationResult,
  installation: ApiInstallation | null,
  t: TFunction,
): ProposalPdfSummary[] {
  if (!installation) return [];

  const normalizedModalidad = normalizeInstallationModalidad(
    installation.modalidad,
  );

  const modes = getAvailableProposalModes(normalizedModalidad);

  return modes.map((mode) =>
    buildProposalPdfSummary(
      buildProposalCardData(result, mode, installation, t),
      installation,
    ),
  );
}

