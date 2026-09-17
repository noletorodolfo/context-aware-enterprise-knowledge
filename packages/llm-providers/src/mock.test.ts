import { describe, expect, it } from "vitest";
import type { Chunk } from "@kb/core";
import type { GenerateInput } from "./provider.js";
import { MOCK_PROMPT_VERSION, MockLlmProvider } from "./mock.js";

const input: GenerateInput = {
  question: {
    text: "Quantos dias posso trabalhar remoto?",
    page: {
      url: "https://contoso.sharepoint.com/sites/kb-demo/SitePages/Home.aspx",
      title: "Home",
      siteUrl: "https://contoso.sharepoint.com/sites/kb-demo",
    },
  },
  user: { name: "Test User A" },
  chunks: [],
};

const chunk: Chunk = {
  id: "item-1#2",
  docId: "item-1",
  title: "politica-home-office",
  url: "https://contoso.sharepoint.com/sites/kb-demo/Politicas/politica-home-office.docx",
  text: "Regras\nO colaborador pode trabalhar remotamente até 3 dias por semana, mediante acordo com o gestor.",
  score: 3,
};

describe("MockLlmProvider", () => {
  it("exposes the mock prompt version", () => {
    expect(new MockLlmProvider().promptVersion).toBe(MOCK_PROMPT_VERSION);
  });

  it("echoes question, user name and page title without citations when there are no chunks", async () => {
    const { draft, usage } = await new MockLlmProvider().generate(input);
    expect(draft.text).toContain("Test User A");
    expect(draft.text).toContain("Quantos dias posso trabalhar remoto?");
    expect(draft.text).toContain("Home");
    expect(draft.citations).toEqual([]);
    expect(draft.refused).toBe(false);
    expect(draft.promptVersion).toBe(MOCK_PROMPT_VERSION);
    expect(usage).toBeUndefined();
  });

  it("cites the start of the first chunk verbatim when chunks exist", async () => {
    const { draft } = await new MockLlmProvider().generate({ ...input, chunks: [chunk] });
    expect(draft.citations).toEqual([{ chunkId: "item-1#2", quote: chunk.text.slice(0, 80) }]);
  });

  it("is deterministic", async () => {
    const provider = new MockLlmProvider();
    expect(await provider.generate(input)).toEqual(await provider.generate(input));
  });
});
