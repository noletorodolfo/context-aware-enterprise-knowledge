import { readdirSync, readFileSync } from "node:fs";
import type { RetrievedDocument } from "@kb/core";
import { maskPii } from "@kb/governance";
import { handleAsk } from "@kb/knowledge-api/ask";
import { MockLlmProvider } from "@kb/llm-providers";
import {
  DEFAULT_LIMITS,
  extractKeywords,
  selectChunks,
  type CandidateSection,
  type Retriever,
} from "@kb/retrievers";
import { parseSampleDoc, type SampleDoc } from "@kb/sample-docs";
import type { AskClient } from "./clients.js";
import type { EvalUser } from "./golden-set.js";

const SITE = "https://contoso.sharepoint.com/sites/kb-demo";
const MAX_DOCUMENTS = 3;

export interface MockDocument {
  name: string;
  url: string;
  restricted: boolean;
  sections: CandidateSection[];
}

/** Level-2 headings split sections; text before the first one forms section 0. */
function toSections(name: string, url: string, doc: SampleDoc): CandidateSection[] {
  const sections: CandidateSection[] = [];
  let current: CandidateSection | undefined;
  for (const block of doc.blocks) {
    if (block.kind === "heading" && block.level === 2) {
      current = {
        docId: name,
        title: name,
        url,
        sectionIndex: sections.length,
        heading: block.text,
        text: "",
      };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { docId: name, title: name, url, sectionIndex: 0, heading: "", text: "" };
      sections.push(current);
    }
    current.text = current.text ? `${current.text}\n${block.text}` : block.text;
  }
  return sections;
}

export function loadMockDocuments(documentsDir: URL): MockDocument[] {
  return readdirSync(documentsDir)
    .filter((file) => file.endsWith(".md") && file !== "README.md")
    .map((file) => {
      const name = file.replace(/\.md$/, "");
      const doc = parseSampleDoc(readFileSync(new URL(file, documentsDir), "utf8"), file);
      const url = `${SITE}/${doc.meta.library}/${name}.docx`;
      return {
        name,
        url,
        restricted: doc.meta.audience === "rh",
        sections: toSections(name, url, doc),
      };
    });
}

/**
 * Stand-in for Graph Search: lexical ranking over the synthetic documents, trimmed to what the
 * caller may read (user B cannot read the restricted HR library). The Graph token names the user.
 */
export function createMockRetriever(documents: MockDocument[]): Retriever {
  return {
    retrieve: ({ question, graphToken }) => {
      const keywords = extractKeywords(question);
      if (keywords.length === 0) {
        return Promise.resolve({ chunks: [], documentCount: 0, documents: [] });
      }
      const ranked = documents
        .filter((doc) => graphToken === "A" || !doc.restricted)
        .map((doc) => ({
          doc,
          score: selectChunks(keywords, doc.sections, DEFAULT_LIMITS).reduce(
            (sum, chunk) => sum + chunk.score,
            0,
          ),
        }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_DOCUMENTS);
      const retrieved: RetrievedDocument[] = ranked.map(({ doc }, index) => ({
        docId: doc.name,
        title: doc.name,
        url: doc.url,
        rank: index + 1,
      }));
      return Promise.resolve({
        chunks: selectChunks(
          keywords,
          ranked.flatMap(({ doc }) => doc.sections),
          DEFAULT_LIMITS,
        ),
        documentCount: ranked.length,
        documents: retrieved,
      });
    },
  };
}

/** In-process pipeline (real handleAsk, mock model, synthetic documents): no sign-in, no Azure. */
export function createMockClient(documentsDir: URL): AskClient {
  const retriever = createMockRetriever(loadMockDocuments(documentsDir));
  const provider = new MockLlmProvider();
  const silent = () => undefined;
  let correlation = 0;

  return async (user: EvalUser, question: string) => {
    const started = performance.now();
    const response = await handleAsk(
      {
        authorization: `Bearer ${user}`,
        body: {
          question,
          page: { url: `${SITE}/SitePages/Home.aspx`, title: "Eval", siteUrl: SITE },
        },
      },
      {
        validateToken: () =>
          Promise.resolve({
            ok: true,
            user: { objectId: `user-${user}`, name: `Usuário ${user}` },
            token: user,
            roles: ["Evaluator"],
          }),
        exchangeToken: (token) => Promise.resolve(token),
        retriever,
        provider,
        logger: { info: silent, warn: silent, error: silent },
        maskPii,
        newCorrelationId: () => `eval-${(correlation += 1)}`,
        now: Date.now,
      },
    );
    return {
      status: response.status,
      body: response.jsonBody,
      latencyMs: performance.now() - started,
    };
  };
}
