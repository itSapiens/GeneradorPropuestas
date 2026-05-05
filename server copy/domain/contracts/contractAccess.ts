import crypto from "node:crypto";
import jwt from "jsonwebtoken";

import type { AppLanguage } from "./contractLocalization";

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

export function generatePlainAccessToken(size = 32): string {
  return crypto.randomBytes(size).toString("base64url");
}

export function buildContinueContractUrl(
  frontendUrl: string,
  plainToken: string,
  language: AppLanguage = "es",
) {
  return `${frontendUrl.replace(
    /\/$/,
    "",
  )}/continuar-contratacion?token=${encodeURIComponent(plainToken)}&lang=${encodeURIComponent(language)}`;
}

export function signContractResumeToken(
  secret: string,
  payload: {
    clientId: string;
    installationId: string;
    studyId: string;
  },
) {
  return jwt.sign(payload, secret, {
    expiresIn: "30m",
  });
}

export function verifyContractResumeToken(secret: string, token: string): {
  clientId: string;
  installationId: string;
  studyId: string;
  iat: number;
  exp: number;
} {
  return jwt.verify(token, secret) as {
    clientId: string;
    installationId: string;
    studyId: string;
    iat: number;
    exp: number;
  };
}
