import { describe, expect, it } from "vitest";
import { readDelta } from "./delta.js";

const DRIVE_URL = "https://contoso.sharepoint.com/sites/kb-demo/Politicas";
const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

function fetcher(responses: ((url: string) => Response | undefined)[]) {
  const urls: string[] = [];
  const fetchFn = ((url: string) => {
    urls.push(url);
    for (const responder of responses) {
      const response = responder(url);
      if (response) return Promise.resolve(response);
    }
    throw new Error(`unexpected request: ${url}`);
  }) as unknown as typeof fetch;
  return { fetchFn, urls };
}

describe("readDelta", () => {
  it("starts from the beginning when there is no stored token", async () => {
    const { fetchFn, urls } = fetcher([
      (url) =>
        url.includes("/delta")
          ? json({ value: [], "@odata.deltaLink": "https://g/delta?token=T1" })
          : undefined,
    ]);

    const page = await readDelta("drive-1", "Politicas", DRIVE_URL, "token", undefined, fetchFn);

    expect(urls[0]).toBe("https://graph.microsoft.com/v1.0/drives/drive-1/root/delta");
    expect(page.deltaToken).toBe("T1");
  });

  it("resumes from the stored token", async () => {
    const { fetchFn, urls } = fetcher([
      (url) =>
        url.includes("/delta")
          ? json({ value: [], "@odata.deltaLink": "https://g/delta?token=T2" })
          : undefined,
    ]);

    await readDelta("drive-1", "Politicas", DRIVE_URL, "token", "T1", fetchFn);

    expect(urls[0]).toContain("delta?token=T1");
  });

  it("reports a deleted item as removed without downloading it", async () => {
    const { fetchFn, urls } = fetcher([
      (url) =>
        url.includes("/delta")
          ? json({
              value: [{ id: "d1", name: "a.docx", deleted: { state: "deleted" } }],
              "@odata.deltaLink": "https://g/delta?token=T2",
            })
          : undefined,
    ]);

    const page = await readDelta("drive-1", "Politicas", DRIVE_URL, "token", undefined, fetchFn);

    expect(page.changes).toEqual([{ docId: "d1", removed: true }]);
    expect(urls.some((url) => url.includes("/content"))).toBe(false);
  });

  it("treats a file it can no longer read as removed", async () => {
    const { fetchFn } = fetcher([
      (url) =>
        url.includes("/delta")
          ? json({
              value: [{ id: "d1", name: "a.docx", webUrl: "https://g/a", file: {} }],
              "@odata.deltaLink": "https://g/delta?token=T2",
            })
          : undefined,
      (url) => (url.includes("/content") ? new Response("no", { status: 404 }) : undefined),
    ]);

    const page = await readDelta("drive-1", "Politicas", DRIVE_URL, "token", undefined, fetchFn);

    expect(page.changes).toEqual([{ docId: "d1", removed: true }]);
    expect(page.skipped).toBe(1);
  });

  it("skips folders and anything that is not a .docx", async () => {
    const { fetchFn } = fetcher([
      (url) =>
        url.includes("/delta")
          ? json({
              value: [
                { id: "f1", name: "Arquivos", folder: {} },
                { id: "x1", name: "planilha.xlsx", file: {} },
              ],
              "@odata.deltaLink": "https://g/delta?token=T2",
            })
          : undefined,
    ]);

    const page = await readDelta("drive-1", "Politicas", DRIVE_URL, "token", undefined, fetchFn);

    expect(page.changes).toEqual([]);
    expect(page.skipped).toBe(2);
  });

  it("follows every page before returning the token of the last one", async () => {
    let call = 0;
    const { fetchFn } = fetcher([
      (url) => {
        if (!url.includes("delta")) return undefined;
        call += 1;
        return call === 1
          ? json({ value: [], "@odata.nextLink": "https://graph.microsoft.com/v1.0/next?page=2" })
          : json({ value: [], "@odata.deltaLink": "https://g/delta?token=FINAL" });
      },
      (url) =>
        url.includes("next?page=2")
          ? json({ value: [], "@odata.deltaLink": "https://g/delta?token=FINAL" })
          : undefined,
    ]);

    const page = await readDelta("drive-1", "Politicas", DRIVE_URL, "token", undefined, fetchFn);

    expect(page.deltaToken).toBe("FINAL");
  });

  it("fails loudly when Graph rejects the delta call", async () => {
    const { fetchFn } = fetcher([
      (url) => (url.includes("/delta") ? new Response("nope", { status: 403 }) : undefined),
    ]);

    await expect(
      readDelta("drive-1", "Politicas", DRIVE_URL, "token", undefined, fetchFn),
    ).rejects.toThrow(/403/);
  });
});
