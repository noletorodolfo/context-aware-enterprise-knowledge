import { describe, expect, it } from "vitest";
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
};

describe("MockLlmProvider", () => {
  it("echoes question, user name and page title in a non-refused answer without citations", async () => {
    const answer = await new MockLlmProvider().generate(input);

    expect(answer.text).toContain("Test User A");
    expect(answer.text).toContain("Quantos dias posso trabalhar remoto?");
    expect(answer.text).toContain("Home");
    expect(answer.citations).toEqual([]);
    expect(answer.refused).toBe(false);
    expect(answer.promptVersion).toBe(MOCK_PROMPT_VERSION);
  });

  it("is deterministic", async () => {
    const provider = new MockLlmProvider();
    expect(await provider.generate(input)).toEqual(await provider.generate(input));
  });
});
