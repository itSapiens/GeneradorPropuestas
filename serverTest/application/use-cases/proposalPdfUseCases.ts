import type { ServerDependencies } from "../ports/serverDependencies";
import { buildProposalPdfHtml } from "../../domain/proposals/proposalPdfHtml";

export async function generateProposalPdfUseCase(
  deps: ServerDependencies,
  payload: unknown,
): Promise<Buffer> {
  const body = payload && typeof payload === "object" ? (payload as any) : {};

  const proposals = Array.isArray(body.proposals) ? body.proposals : [];

  if (!body.billData || !body.calculationResult || proposals.length === 0) {
    throw new Error("Faltan datos para generar el PDF de propuesta");
  }

  const html = buildProposalPdfHtml({
    billData: body.billData,
    calculationResult: body.calculationResult,
    continueContractUrl: body.continueContractUrl,
    language: body.language,
    proposals,
  });

  return deps.services.pdf.convertHtmlToPdf({ html });
}
