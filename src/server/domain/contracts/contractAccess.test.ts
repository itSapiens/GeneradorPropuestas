import { describe, expect, it } from "vitest";

import {
  buildContinueContractUrl,
  normalizeDni,
  normalizeIdentityText,
  sha256,
  signContractResumeToken,
  verifyContractResumeToken,
} from "./contractAccess";

describe("contractAccess domain", () => {
  it("normalizes DNI and identity fields consistently", () => {
    expect(normalizeDni(" 12345678z ")).toBe("12345678Z");
    expect(normalizeIdentityText(" José   Pérez  ")).toBe("jose perez");
  });

  it("builds the continue contract URL with token and language", () => {
    const url = buildContinueContractUrl(
      "https://example.com/",
      "abc123",
      "ca",
    );

    expect(url).toBe(
      "https://example.com/continuar-contratacion?token=abc123&lang=ca",
    );
  });

  it("signs and verifies resume tokens with the provided secret", () => {
    const secret = "test-secret";
    const token = signContractResumeToken(secret, {
      clientId: "client-1",
      installationId: "installation-1",
      studyId: "study-1",
    });

    const decoded = verifyContractResumeToken(secret, token);

    expect(decoded.studyId).toBe("study-1");
    expect(decoded.clientId).toBe("client-1");
    expect(decoded.installationId).toBe("installation-1");
  });

  it("creates deterministic sha256 hashes", () => {
    expect(sha256("demo")).toBe(sha256("demo"));
    expect(sha256("demo")).not.toBe(sha256("other"));
  });
});
