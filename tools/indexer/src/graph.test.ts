import { describe, expect, it } from "vitest";
import { documentUrl, siteAddress } from "./graph.js";

const DRIVE = "https://contoso.sharepoint.com/sites/kb-demo/RH-Restrito";
const DOC_ASPX =
  "https://contoso.sharepoint.com/sites/kb-demo/_layouts/15/Doc.aspx?sourcedoc=%7B1F58%7D";

describe("documentUrl", () => {
  it("rebuilds the path form Graph Search also returns, so both retrievers cite the same URL", () => {
    expect(documentUrl(DRIVE, "tabela-salarial-2026.docx", DOC_ASPX)).toBe(
      `${DRIVE}/tabela-salarial-2026.docx`,
    );
  });

  it("escapes characters that are not allowed in a path segment", () => {
    expect(documentUrl(DRIVE, "plano 2026.docx", DOC_ASPX)).toBe(`${DRIVE}/plano%202026.docx`);
  });

  it("falls back to the item URL when the drive has none", () => {
    expect(documentUrl(undefined, "a.docx", DOC_ASPX)).toBe(DOC_ASPX);
  });
});

describe("siteAddress", () => {
  it("turns a site URL into the Graph site address", () => {
    expect(siteAddress("https://contoso.sharepoint.com/sites/kb-demo/")).toBe(
      "contoso.sharepoint.com:/sites/kb-demo",
    );
  });
});
