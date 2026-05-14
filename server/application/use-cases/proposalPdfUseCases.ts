import { GoogleGenAI, Type } from "@google/genai";

import type { ServerDependencies } from "../ports/serverDependencies";
import { buildProposalPdfHtml } from "../../domain/proposals/proposalPdfHtml";
import type {
  AppLanguage,
  ProposalPdfSummary,
} from "../../../src/entities/proposal/domain/proposalPdf.types";

const DEFAULT_COMPANY_LOGO_BUCKET = "empresa-logos";
const DEFAULT_TRANSLATION_MODEL =
  process.env.GEMINI_TRANSLATION_MODEL?.trim() || "gemini-2.5-flash-lite";
const companyPhraseTranslationCache = new Map<string, string[]>();

const phraseTranslationResponseSchema = {
  type: Type.OBJECT,
  properties: {
    translations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          index: { type: Type.INTEGER },
          text: { type: Type.STRING },
        },
        required: ["index", "text"],
      },
    },
  },
  required: ["translations"],
} as const;

type CompanyPhraseTranslator = (
  texts: string[],
  language: AppLanguage,
) => Promise<string[]>;

function extractGeminiResponseText(response: any): string {
  if (!response?.text) return "";
  return typeof response.text === "function"
    ? response.text().trim()
    : String(response.text).trim();
}

function normalizeLanguage(value: unknown): AppLanguage {
  if (value === "ca" || value === "val" || value === "gl") return value;
  return "es";
}

function normalizePhraseToken(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isKnownDefaultCoverPhrase(parts: string[]): boolean {
  const incoming = normalizePhraseToken(parts.filter(Boolean).join(" "));
  const defaults = [
    "La energía, en tus manos sin tocar tu tejado.",
    "L'energia, a les teues mans sense tocar la teua teulada.",
    "A enerxía, nas túas mans sen tocar o teu tellado.",
  ].map(normalizePhraseToken);

  return defaults.includes(incoming);
}

function targetLanguageName(language: AppLanguage): string {
  if (language === "gl") return "gallego";
  if (language === "ca") return "catalán";
  if (language === "val") return "valenciano";
  return "español";
}

async function translateCompanyPhrasePartsWithGemini(
  texts: string[],
  language: AppLanguage,
): Promise<string[]> {
  if (language === "es") return texts;

  const cleanTexts = texts.map((text) => text.trim());
  const cacheKey = JSON.stringify({ language, texts: cleanTexts });
  const cached = companyPhraseTranslationCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    console.warn(
      "[proposal-pdf] No se puede traducir la frase de empresa: falta GEMINI_API_KEY",
    );
    return texts;
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: DEFAULT_TRANSLATION_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              `Traduce estos fragmentos al ${targetLanguageName(language)}.`,
              "Los fragmentos forman una sola frase comercial y deben conservar el orden.",
              "Mantén el tono natural, corrige contracciones si corresponde y no añadas texto.",
              "Devuelve exactamente una traducción por fragmento con el mismo índice.",
              JSON.stringify(cleanTexts),
            ].join("\n"),
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: phraseTranslationResponseSchema,
      temperature: 0,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const parsed = JSON.parse(extractGeminiResponseText(response)) as {
    translations?: Array<{ index?: number; text?: string }>;
  };
  const translated = cleanTexts.map((text, index) => {
    const item = parsed.translations?.find((translation) => translation.index === index);
    return typeof item?.text === "string" && item.text.trim()
      ? item.text.trim()
      : text;
  });

  companyPhraseTranslationCache.set(cacheKey, translated);
  return translated;
}

export async function translateCompanyPdfPhrasesForLanguage(
  proposals: ProposalPdfSummary[],
  language: AppLanguage,
  translator: CompanyPhraseTranslator = translateCompanyPhrasePartsWithGemini,
): Promise<ProposalPdfSummary[]> {
  if (language === "es") return proposals;

  return Promise.all(
    proposals.map(async (proposal) => {
      const parts = [
        proposal.companyPdfFraseInicio?.trim() || "",
        proposal.companyPdfFraseDestacada?.trim() || "",
        proposal.companyPdfFraseFinal?.trim() || "",
      ];

      if (!parts.some(Boolean) || isKnownDefaultCoverPhrase(parts)) {
        return proposal;
      }

      try {
        const [intro, highlighted, final] = await translator(parts, language);

        return {
          ...proposal,
          companyPdfFraseDestacada: highlighted || proposal.companyPdfFraseDestacada,
          companyPdfFraseFinal: final || proposal.companyPdfFraseFinal,
          companyPdfFraseInicio: intro || proposal.companyPdfFraseInicio,
        };
      } catch (error) {
        console.warn("[proposal-pdf] No se pudo traducir la frase de empresa", {
          error,
          language,
        });
        return proposal;
      }
    }),
  );
}

export async function resolveCompanyLogoDataUri(
  deps: ServerDependencies,
  proposals: ProposalPdfSummary[],
): Promise<string | null> {
  const proposalWithLogo = proposals.find((proposal) => proposal.companyLogoPath?.trim());
  const logoPath = proposalWithLogo?.companyLogoPath?.trim();

  if (!logoPath) return null;

  try {
    const logo = await deps.services.documents.downloadFileAsBuffer({
      bucket: proposalWithLogo.companyLogoBucket?.trim() || DEFAULT_COMPANY_LOGO_BUCKET,
      path: logoPath,
    });
    const mimeType = proposalWithLogo.companyLogoMimeType?.trim() || logo.mimeType || "image/png";

    if (!mimeType.startsWith("image/")) {
      console.warn("[proposal-pdf] Logo de empresa ignorado por MIME no soportado", {
        logoPath,
        mimeType,
      });
      return null;
    }

    return `data:${mimeType};base64,${logo.buffer.toString("base64")}`;
  } catch (error) {
    console.warn("[proposal-pdf] No se pudo cargar el logo de empresa", {
      error,
      logoPath,
    });
    return null;
  }
}

export async function generateProposalPdfUseCase(
  deps: ServerDependencies,
  payload: unknown,
): Promise<Buffer> {
  const body = payload && typeof payload === "object" ? (payload as any) : {};

  const proposals = Array.isArray(body.proposals)
    ? (body.proposals as ProposalPdfSummary[])
    : [];

  if (!body.billData || !body.calculationResult || proposals.length === 0) {
    throw new Error("Faltan datos para generar el PDF de propuesta");
  }

  const language = normalizeLanguage(body.language);
  const localizedProposals = await translateCompanyPdfPhrasesForLanguage(
    proposals,
    language,
  );

  const html = buildProposalPdfHtml({
    billData: body.billData,
    calculationResult: body.calculationResult,
    companyLogoDataUri: await resolveCompanyLogoDataUri(deps, localizedProposals),
    continueContractUrl: body.continueContractUrl,
    language,
    proposals: localizedProposals,
  });

  return deps.services.pdf.convertHtmlToPdf({ html, waitForExpression: "window.chartReady === true" });
}
