import type { ServerDependencies } from "../ports/serverDependencies";
import { normalizeAppLanguage } from "../../domain/contracts/contractLocalization";
import { pickFirstString } from "../../utils/stringUtils";
import { toPositiveNumber } from "../../utils/parsingUtils";
import { notFound, badRequest } from "../../shared/http/httpError";

export async function getContractContextFromStudy(
  deps: ServerDependencies,
  studyId: string,
) {
  const study = await deps.repositories.studies.findById(studyId);

  if (!study) {
    throw notFound("El estudio no existe");
  }

  const customer = study.customer ?? {};
  const clientDni =
    pickFirstString(customer?.dni, customer?.documentNumber) ?? null;

  if (!clientDni) {
    throw badRequest("El estudio no tiene DNI de cliente");
  }

  const client = await deps.repositories.clients.findByDni(clientDni);

  if (!client) {
    throw notFound("No se encontró el cliente asociado al estudio");
  }

  const installationId = study.selected_installation_id ?? null;

  if (!installationId) {
    throw badRequest("El estudio no tiene instalación asignada");
  }

  const installation = await deps.repositories.installations.findById(
    installationId,
  );

  if (!installation) {
    throw notFound("La instalación asociada al estudio no existe");
  }

  const assignedKwp =
    toPositiveNumber(study.assigned_kwp) ??
    toPositiveNumber(study?.calculation?.recommendedPowerKwp) ??
    toPositiveNumber(study?.selected_installation_snapshot?.assigned_kwp);

  if (assignedKwp === null) {
    throw badRequest("El estudio no tiene assigned_kwp válido");
  }

  return {
    assignedKwp,
    client,
    installation,
    language: normalizeAppLanguage(study.language),
    study,
  };
}

export async function createProposalContinueAccessToken(
  deps: ServerDependencies,
  params: {
    clientId: string;
    expiresInDays?: number;
    language?: unknown;
    studyId: string;
  },
) {
  const { buildContinueContractUrl, generatePlainAccessToken, sha256 } = await import(
    "../../domain/contracts/contractAccess"
  );
  const { normalizeAppLanguage } = await import(
    "../../domain/contracts/contractLocalization"
  );

  const appLanguage = normalizeAppLanguage(params.language);
  const plainToken = generatePlainAccessToken(32);
  const tokenHash = sha256(plainToken);
  const expiresAt = new Date(
    Date.now() + (params.expiresInDays ?? 15) * 24 * 60 * 60 * 1000,
  ).toISOString();

  await deps.repositories.accessTokens.revokeActiveProposalContinueTokens({
    clientId: params.clientId,
    studyId: params.studyId,
  });

  await deps.repositories.accessTokens.create({
    study_id: params.studyId,
    contract_id: null,
    client_id: params.clientId,
    token_hash: tokenHash,
    purpose: "proposal_continue",
    expires_at: expiresAt,
    used_at: null,
    revoked_at: null,
  });

  return {
    continueUrl: buildContinueContractUrl(
      deps.env.frontendUrl,
      plainToken,
      appLanguage,
    ),
    expiresAt,
    plainToken,
  };
}
