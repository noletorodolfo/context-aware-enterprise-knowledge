export type PiiType = "cpf" | "cnpj" | "email" | "phone";

export interface PiiFinding {
  type: PiiType;
  count: number;
}

export interface PiiMaskResult {
  masked: string;
  findings: PiiFinding[];
}

const PLACEHOLDERS: Record<PiiType, string> = {
  cpf: "[CPF]",
  cnpj: "[CNPJ]",
  email: "[EMAIL]",
  phone: "[TELEFONE]",
};

const digitsOf = (value: string) => value.replace(/\D/g, "");

const allSameDigit = (digits: string) => /^(\d)\1+$/.test(digits);

/** Modulo-11 check digit used by CPF and CNPJ. */
function checkDigit(digits: string, weights: number[]): number {
  const sum = weights.reduce((acc, weight, i) => acc + weight * Number(digits[i]), 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function isValidCpf(value: string): boolean {
  const digits = digitsOf(value);
  if (digits.length !== 11 || allSameDigit(digits)) return false;
  const first = checkDigit(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(digits[9]) && second === Number(digits[10]);
}

export function isValidCnpj(value: string): boolean {
  const digits = digitsOf(value);
  if (digits.length !== 14 || allSameDigit(digits)) return false;
  const first = checkDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = checkDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === Number(digits[12]) && second === Number(digits[13]);
}

interface Detector {
  type: PiiType;
  pattern: RegExp;
  accept?: (match: string) => boolean;
}

// Order matters: emails first, then CNPJ (14 digits) before CPF (11) and phones, so longer
// identifiers are not partially consumed by shorter patterns.
const DETECTORS: Detector[] = [
  { type: "email", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  {
    type: "cnpj",
    pattern: /(?<![\d/.-])\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?![\d/.-])/g,
    accept: isValidCnpj,
  },
  {
    type: "cpf",
    pattern: /(?<![\d/.-])\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?![\d/.-])/g,
    accept: isValidCpf,
  },
  {
    type: "phone",
    // (11) 98765-4321 · 11 3456-7890 · +55 11 98765-4321 · 11987654321 (mobile)
    pattern:
      /(?<![\w+])(?:\+55\s?)?(?:(?:\(\d{2}\)\s?|\d{2}[\s-]?)9?\d{4}[\s-]\d{4}|[1-9]{2}9\d{8})(?![\w/])/g,
  },
];

/**
 * Replaces personal data in free text with placeholders. Only valid CPF/CNPJ numbers are masked,
 * so order numbers and other identifiers are kept. Returns counts per type, never the values.
 */
export function maskPii(text: string): PiiMaskResult {
  const counts = new Map<PiiType, number>();
  let masked = text;

  for (const detector of DETECTORS) {
    masked = masked.replace(detector.pattern, (match) => {
      if (detector.accept && !detector.accept(match)) return match;
      counts.set(detector.type, (counts.get(detector.type) ?? 0) + 1);
      return PLACEHOLDERS[detector.type];
    });
  }

  const findings = [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => a.type.localeCompare(b.type));
  return { masked, findings };
}
