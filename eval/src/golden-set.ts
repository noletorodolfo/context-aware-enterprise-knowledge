import { readFileSync } from "node:fs";
import { z } from "zod";

export type Category = "answerable" | "permission" | "unanswerable" | "pii" | "injection";
export type EvalUser = "A" | "B";

export interface GoldenCase {
  id: string;
  category: Category;
  /** pt-BR question, exactly as a user would type it. */
  question: string;
  askAs: EvalUser | "both";
  /** Document file names (without extension) that hold the answer. */
  expectedDocuments: string[];
  /** Short strings the answer should contain. */
  expectedFacts: string[];
  /** Library or document names user B must never cite for this question. */
  mustNotCite: string[];
  /** Per user; when absent, only "unanswerable" cases expect a refusal. */
  expectRefusal?: { A?: boolean; B?: boolean };
  /** Personal data embedded in the question ("pii" cases). */
  pii?: { types: ("cpf" | "cnpj" | "email" | "phone")[]; values: string[] };
}

/** 30 cases, 33 executions ("permission" cases are asked by both users). */
export const COMPOSITION: Record<Category, number> = {
  answerable: 15,
  permission: 3,
  unanswerable: 5,
  pii: 4,
  injection: 3,
};

const ASKED_BY: Record<Category, GoldenCase["askAs"]> = {
  answerable: "B",
  permission: "both",
  unanswerable: "A",
  pii: "B",
  injection: "B",
};

const caseSchema = z.object({
  id: z.string().regex(/^[a-z]+-\d{2}$/),
  category: z.enum(["answerable", "permission", "unanswerable", "pii", "injection"]),
  question: z.string().min(1).max(1000),
  askAs: z.enum(["A", "B", "both"]),
  expectedDocuments: z.array(z.string().min(1)),
  expectedFacts: z.array(z.string().min(1)),
  mustNotCite: z.array(z.string().min(1)),
  expectRefusal: z.object({ A: z.boolean().optional(), B: z.boolean().optional() }).optional(),
  pii: z
    .object({
      types: z.array(z.enum(["cpf", "cnpj", "email", "phone"])).min(1),
      values: z.array(z.string().min(1)).min(1),
    })
    .optional(),
});

const goldenSetSchema = z.object({ version: z.literal(1), cases: z.array(caseSchema) });

export function usersOf(goldenCase: GoldenCase): EvalUser[] {
  return goldenCase.askAs === "both" ? ["A", "B"] : [goldenCase.askAs];
}

export function expectsRefusal(goldenCase: GoldenCase, user: EvalUser): boolean {
  return goldenCase.expectRefusal?.[user] ?? goldenCase.category === "unanswerable";
}

/** Parses and checks the golden set; throws with every problem found. */
export function validateGoldenSet(raw: unknown): GoldenCase[] {
  const parsed = goldenSetSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`golden set: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  const cases = parsed.data.cases as GoldenCase[];
  const problems: string[] = [];

  const ids = new Set<string>();
  for (const goldenCase of cases) {
    if (ids.has(goldenCase.id)) problems.push(`duplicate id ${goldenCase.id}`);
    ids.add(goldenCase.id);
    if (goldenCase.askAs !== ASKED_BY[goldenCase.category]) {
      problems.push(
        `${goldenCase.id}: ${goldenCase.category} cases are asked by ${ASKED_BY[goldenCase.category]}`,
      );
    }
    if ((goldenCase.category === "pii") !== (goldenCase.pii !== undefined)) {
      problems.push(`${goldenCase.id}: "pii" is required for pii cases only`);
    }
    const answers = usersOf(goldenCase).some((user) => !expectsRefusal(goldenCase, user));
    if (answers && goldenCase.expectedDocuments.length === 0) {
      problems.push(`${goldenCase.id}: answered cases need expected documents`);
    }
  }
  for (const [category, expected] of Object.entries(COMPOSITION)) {
    const count = cases.filter((c) => c.category === category).length;
    if (count !== expected)
      problems.push(`${category}: expected ${expected} cases, found ${count}`);
  }
  if (problems.length > 0) throw new Error(`golden set: ${problems.join("; ")}`);
  return cases;
}

export function loadGoldenSet(path: URL): GoldenCase[] {
  return validateGoldenSet(JSON.parse(readFileSync(path, "utf8")));
}
