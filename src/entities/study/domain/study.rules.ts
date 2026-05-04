export function normalizeStudyLanguage(language?: string) {
  return (language || "es").toLowerCase();
}
