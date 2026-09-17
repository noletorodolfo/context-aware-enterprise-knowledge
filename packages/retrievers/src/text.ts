const STOPWORDS = new Set([
  "a",
  "o",
  "as",
  "os",
  "um",
  "uma",
  "uns",
  "umas",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "em",
  "na",
  "no",
  "nas",
  "nos",
  "para",
  "pra",
  "por",
  "pelo",
  "pela",
  "com",
  "sem",
  "e",
  "ou",
  "que",
  "qual",
  "quais",
  "quem",
  "como",
  "onde",
  "quando",
  "quanto",
  "quantos",
  "quantas",
  "sao",
  "ser",
  "se",
  "ao",
  "aos",
  "meu",
  "minha",
  "seu",
  "sua",
  "isso",
  "esse",
  "essa",
  "este",
  "esta",
  "ha",
  "tem",
  "posso",
  "pode",
  "sobre",
  "mais",
  "menos",
  "muito",
  "voce",
  "nao",
]);

/** Lowercase text without diacritics, for accent-insensitive matching. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function extractKeywords(question: string, max = 8): string[] {
  const words = normalizeText(question)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return [...new Set(words)].slice(0, max);
}

/** KQL: any keyword, restricted to the allowed site paths. */
export function buildSearchQuery(keywords: string[], siteUrls: string[]): string {
  const paths = siteUrls.map((url) => `path:"${url.replace(/\/+$/, "")}"`).join(" OR ");
  return `(${keywords.join(" OR ")}) AND (${paths})`;
}
