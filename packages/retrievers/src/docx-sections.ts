import mammoth from "mammoth";

export interface Section {
  heading: string;
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };

function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|li|h[1-6])>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39);/g, (_m, name: string) => ENTITIES[name] ?? "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n");
}

/** Splits a .docx into sections at Title/Heading 1–3 paragraphs. */
export async function extractSections(buffer: Buffer): Promise<Section[]> {
  const { value: html } = await mammoth.convertToHtml(
    { buffer },
    { styleMap: ["p[style-name='Title'] => h1:fresh"] },
  );

  return html
    .split(/(?=<h[1-3][^>]*>)/i)
    .map((part) => {
      const match = /^<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i.exec(part);
      const heading = match ? htmlToText(match[1] ?? "") : "";
      const body = match ? part.slice(match[0].length) : part;
      return { heading, text: htmlToText(body) };
    })
    .filter((section) => section.text !== "");
}
