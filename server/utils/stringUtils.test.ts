import { describe, expect, it } from "vitest";

import { isValidCupsFormat, normalizeCups } from "./stringUtils";

describe("normalizeCups", () => {
  it("extracts a valid CUPS from OCR text that continues with another label", () => {
    const cups = normalizeCups("ES0021000011183470LQDIRECCI");

    expect(cups).toBe("ES0021000011183470LQ");
    expect(isValidCupsFormat(cups)).toBe(true);
  });

  it("keeps valid 22-character CUPS suffixes", () => {
    expect(normalizeCups("ES0031406276833001ZT0F")).toBe(
      "ES0031406276833001ZT0F",
    );
  });
});
