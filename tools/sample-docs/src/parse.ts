export type Audience = "todos" | "rh";

export interface SampleDocMeta {
  title: string;
  library: string;
  audience: Audience;
  purpose?: string;
}

export type Block =
  | { kind: "heading"; level: 1 | 2; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "numbered"; text: string };

export interface SampleDoc {
  meta: SampleDocMeta;
  blocks: Block[];
}

const AUDIENCES: readonly Audience[] = ["todos", "rh"];

/** Parser mínimo para o subconjunto de Markdown usado em samples/documents. */
export function parseSampleDoc(source: string, fileName: string): SampleDoc {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source.replace(/\r\n/g, "\n"));
  const [, header, body] = match ?? [];
  if (header === undefined || body === undefined) {
    throw new Error(`${fileName}: front matter ausente`);
  }

  const fields = Object.fromEntries(
    header.split("\n").map((line) => {
      const i = line.indexOf(":");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
  );

  const { title, library, audience, purpose } = fields;
  if (!title || !library) throw new Error(`${fileName}: title e library são obrigatórios`);
  if (!AUDIENCES.includes(audience as Audience)) {
    throw new Error(`${fileName}: audience deve ser um de ${AUDIENCES.join(", ")}`);
  }

  const meta: SampleDocMeta = { title, library, audience: audience as Audience };
  if (purpose) meta.purpose = purpose;

  const blocks: Block[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("## ")) blocks.push({ kind: "heading", level: 2, text: line.slice(3) });
    else if (line.startsWith("# ")) blocks.push({ kind: "heading", level: 1, text: line.slice(2) });
    else if (line.startsWith("- ")) blocks.push({ kind: "bullet", text: line.slice(2) });
    else if (/^\d+\.\s/.test(line))
      blocks.push({ kind: "numbered", text: line.replace(/^\d+\.\s/, "") });
    else blocks.push({ kind: "paragraph", text: line });
  }

  return { meta, blocks };
}
