import crypto from "node:crypto";
import jwt from "jsonwebtoken";

import { supabase } from "../clients/supabaseClient";
import { CONTRACT_RESUME_JWT_SECRET, FRONTEND_URL } from "../config/env";
import {
  normalizeAppLanguage,
  type AppLanguage,
} from "./contractLocalizationService";

export function normalizeIdentityText(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function normalizeDni(value: string): string {
  return (value || "").trim().toUpperCase().replace(/\s+/g, "");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function generatePlainAccessToken(size = 32): string {
  return crypto.randomBytes(size).toString("base64url");
}

export function buildContinueContractUrl(
  plainToken: string,
  language: AppLanguage = "es",
) {
  return `${FRONTEND_URL.replace(
    /\/$/,
    "",
  )}/continuar-contratacion?token=${encodeURIComponent(plainToken)}&lang=${encodeURIComponent(language)}`;
}

export async function createProposalContinueAccessToken(params: {
  studyId: string;
  clientId: string;
  language?: unknown;
  expiresInDays?: number;
}) {
  const { studyId, clientId, language, expiresInDays = 15 } = params;

  const appLanguage = normalizeAppLanguage(language);

  const plainToken = generatePlainAccessToken(32);
  const tokenHash = sha256(plainToken);
  const expiresAt = new Date(
    Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  await supabase
    .from("contract_access_tokens")
    .update({
      revoked_at: new Date().toISOString(),
    })
    .eq("study_id", studyId)
    .eq("client_id", clientId)
    .eq("purpose", "proposal_continue")
    .is("used_at", null)
    .is("revoked_at", null);

  const { error } = await supabase.from("contract_access_tokens").insert({
    study_id: studyId,
    contract_id: null,
    client_id: clientId,
    token_hash: tokenHash,
    purpose: "proposal_continue",
    expires_at: expiresAt,
    used_at: null,
    revoked_at: null,
  });

  if (error) {
    throw new Error(
      `No se pudo crear el token de acceso al contrato: ${error.message}`,
    );
  }

  return {
    plainToken,
    expiresAt,
    continueUrl: buildContinueContractUrl(plainToken, appLanguage),
  };
}

export function signContractResumeToken(payload: {
  studyId: string;
  clientId: string;
  installationId: string;
}) {
  return jwt.sign(payload, CONTRACT_RESUME_JWT_SECRET, {
    expiresIn: "30m",
  });
}

export function verifyContractResumeToken(token: string): {
  studyId: string;
  clientId: string;
  installationId: string;
  iat: number;
  exp: number;
} {
  return jwt.verify(token, CONTRACT_RESUME_JWT_SECRET) as {
    studyId: string;
    clientId: string;
    installationId: string;
    iat: number;
    exp: number;
  };
}
