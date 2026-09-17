# Phase 2 — Permission-aware retrieval and real LLM: design

- **Status:** approved (2026-09-17)
- **Scope:** `docs/PLAN.md`, section 11, Phase 2
- **Builds on:** `docs/superpowers/specs/2026-09-16-phase-1-end-to-end-skeleton-design.md`
- **Goal:** users A and B ask the same question on the demo site and receive answers grounded in the
  documents **each of them can open**, with correct citations; an automated end-to-end test proves
  user B never receives a citation from the restricted HR library.

## 1. Decisions

| #   | Decision                                                                                                                                                                                                                                                                                                                        | Why                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | The API proves its identity for the On-Behalf-Of (OBO) exchange with a **client assertion signed by an Azure Key Vault certificate whose private key is non-exportable**. The Function's managed identity may only sign with that key. The certificate's public part is registered on `kb-knowledge-api-dev` by Terraform.      | A managed identity cannot be a federated credential for an app registration in another tenant (ADR-011: identity in the partner tenant, compute in the personal subscription). A client secret would break the "no secrets" rule; moving the app registration would reopen ADR-011. |
| D2  | The no-leak requirement is proven by an **end-to-end test with interactive sign-in** (`npm run test:e2e`): the browser opens once for user A and once for user B, then assertions run against the deployed API. It uses a new public client app `kb-e2e-client-dev` (no secret). CI keeps running unit tests with Graph mocked. | Only real tokens against the real tenant prove permission trimming. No stored passwords (ROPC is rejected: incompatible with MFA and discouraged).                                                                                                                                  |
| D3  | Retrieval downloads the **full content of the top 3 search hits** with the user's token, splits `.docx` files into sections by heading and sends the most relevant sections to the model.                                                                                                                                       | Graph Search summaries are too short for complete answers and useful citations.                                                                                                                                                                                                     |
| D4  | The search scope is configuration (`SEARCH_SITE_URLS`), starting with the demo site only. Hits outside the scope are discarded even if Graph returns them.                                                                                                                                                                      | Real partner documents must not reach the model in the personal subscription; widening the scope later is a configuration change.                                                                                                                                                   |
| D5  | LLM: **Azure OpenAI**, a "mini" chat model on a **Global Standard** deployment, authenticated with the Function's managed identity (no API key), low tokens-per-minute quota set in Terraform. The mock provider stays for tests and CI.                                                                                        | Cheapest option available in any region; synthetic documents make global processing acceptable. A regional deployment is the switch for real data.                                                                                                                                  |
| D6  | Budget alert raised from USD 1 to **USD 5**.                                                                                                                                                                                                                                                                                    | Confirmed by the user; avoids false alarms from real usage.                                                                                                                                                                                                                         |
| D7  | Prompts are versioned files (`prompts/v1.md`); retrieved content is delimited and declared untrusted; the prompt forbids following instructions found in documents.                                                                                                                                                             | Indirect prompt injection defense (full evaluation arrives in Phase 3).                                                                                                                                                                                                             |

Out of scope (YAGNI): conversation history, PII filtering, full OpenTelemetry, Azure AI Search,
golden-set evaluation runner.

## 2. Request flow

1. Validate the user's JWT (Phase 1, unchanged).
2. **OBO:** exchange the user's token for a Microsoft Graph token (`Sites.Read.All Files.Read.All`,
   delegated). The client assertion is signed by Key Vault. Graph tokens are cached **in memory only**,
   per user (keyed by token `oid`), until shortly before expiry.
3. **Search:** Microsoft Graph Search (`driveItem`) with the user's Graph token, query restricted to
   `SEARCH_SITE_URLS` (KQL `path:` filter); keep hits whose `webUrl` starts with an allowed site URL; top 3.
4. **Download:** fetch each hit's content with the user's Graph token (files over 2 MB skipped), extract
   `.docx` text into sections by heading.
5. **Select:** score sections against the question (lexical overlap), keep at most 8 sections and at most
   12 000 characters. Chunk id: `<driveItemId>#<sectionIndex>`.
6. **No relevant sections → refusal** (`refused: true`, pt-BR refusal text from `@kb/core`) **without
   calling the model**.
7. **Generate:** Azure OpenAI with `prompts/v1.md`, structured JSON output `{ answer, citations: [{ chunkId, quote }] }`,
   max 600 output tokens. Validate with zod; one retry on invalid JSON.
8. **Ground:** `enforceGrounding` (Phase 0) drops citations whose chunk was not retrieved or whose quote is
   not in the chunk; if none survive, the answer becomes a refusal.
9. Respond with the `Answer`; each citation carries `chunkId`, `quote`, `title`, `url` (from the chunk).

## 3. Components

| Unit                                                 | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`                                      | `Citation` gains `title` and `url`; SPFx `contract.ts` follows (drift check fails the typecheck otherwise).                                                                                                                                                                                                                                                                                                                                                            |
| `packages/retrievers` (new)                          | `Retriever` interface (`retrieve({ question, graphToken }) → Chunk[]`) and `GraphSearchRetriever` (search, scope filter, download, `.docx` section extraction, selection). HTTP via an injectable `fetch`.                                                                                                                                                                                                                                                             |
| `apps/knowledge-api/src/auth/key-vault-assertion.ts` | Builds the client assertion JWT (header with the certificate thumbprint) and signs it through a Key Vault crypto client.                                                                                                                                                                                                                                                                                                                                               |
| `apps/knowledge-api/src/auth/obo.ts`                 | OBO token request to the partner tenant's token endpoint, typed errors (`consent-required`, `upstream`), per-user in-memory cache.                                                                                                                                                                                                                                                                                                                                     |
| `packages/llm-providers`                             | `LlmProvider.generate` receives the selected chunks; new `AzureOpenAiProvider` (managed identity, structured output, zod validation, one retry, typed errors `unavailable`/`invalid-output`); `MockLlmProvider` updated to cite the first chunk when present.                                                                                                                                                                                                          |
| `prompts/v1.md`                                      | System prompt (pt-BR answers, cite only provided sections, untrusted content, refuse when not found).                                                                                                                                                                                                                                                                                                                                                                  |
| `apps/knowledge-api/src/ask/handle-ask.ts`           | Orchestrates OBO → retrieve → refuse-or-generate → ground; maps typed errors to status codes; metadata-only logging.                                                                                                                                                                                                                                                                                                                                                   |
| `apps/spfx-assistant`                                | Renders numbered citations (document title linking to the file, quoted excerpt), refusal notice, `403` → not-configured, timeout 45 s.                                                                                                                                                                                                                                                                                                                                 |
| `infra/terraform`                                    | Key Vault (RBAC) with a self-signed certificate (non-exportable key); certificate credential on the API app; Function role _Key Vault Crypto User_ on that key; Azure OpenAI account + model deployment + Function role _Cognitive Services OpenAI User_; public client app `kb-e2e-client-dev` with permission to the API scope; app settings `SEARCH_SITE_URLS`, `KEY_VAULT_URL`, `OBO_CERT_NAME`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`; budget USD 5. |
| `apps/knowledge-api/e2e/`                            | No-leak end-to-end test with interactive sign-in for users A and B; tokens cached locally in a git-ignored file.                                                                                                                                                                                                                                                                                                                                                       |

## 4. Error handling

| Situation                                                                        | API                                   | User sees (pt-BR)                                                     |
| -------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------- |
| Invalid token (Phase 1)                                                          | `401`                                 | "Não foi possível autenticar. Recarregue a página."                   |
| Invalid body (Phase 1)                                                           | `400`                                 | "Escreva uma pergunta de até 1.000 caracteres."                       |
| OBO fails with consent/interaction error (`AADSTS65001`, `interaction_required`) | `403` `{ error: "consent-required" }` | "Assistente não configurado neste site."                              |
| OBO fails otherwise, Key Vault unavailable                                       | `502`                                 | "Assistente indisponível no momento."                                 |
| Graph error or timeout (10 s)                                                    | `502`                                 | "Assistente indisponível no momento."                                 |
| No accessible or relevant documents                                              | `200`, `refused: true`                | "Não encontrei essa informação nos documentos disponíveis para você." |
| Azure OpenAI `429` or timeout (20 s)                                             | `503`                                 | "Assistente indisponível no momento."                                 |
| Model returns invalid JSON twice                                                 | `502`                                 | "O assistente teve um problema. Tente de novo."                       |
| Every citation invented                                                          | `200`, `refused: true`                | refusal text                                                          |

SPFx mapping changes: `403` → not-configured (was unauthorized); `502`/`503`/`504` → unavailable
(unchanged); client timeout 30 s → 45 s. Question, document and answer text are never logged; logs carry
counts (hits, sections, characters), token usage, durations and refusal reason.

## 5. Limits and security

- Top 3 documents, at most 8 sections, at most 12 000 characters of context, 600 output tokens, files ≤ 2 MB.
- Azure OpenAI deployment capacity kept low in Terraform so runaway usage hits `429` before cost matters.
- Documents are read **only** with the user's delegated Graph token; the API holds no application
  permission to read content.
- The Function can sign with the Key Vault key but cannot export it.
- OBO token cache is in memory only, never logged or persisted.

## 6. Testing

Automated (`npm run check`, no sign-in):

- **Retriever:** query always carries the scope filter; out-of-scope hits discarded; top 3; > 2 MB skipped;
  `.docx` → sections by heading (fixture generated from synthetic samples); selection limits; Graph
  error/timeout → typed error.
- **Client assertion / OBO:** assertion claims (`aud` token endpoint, `iss`/`sub` client id, `jti`, `exp`)
  and header thumbprint; signing delegated to a fake crypto client; OBO request shape; `AADSTS65001` →
  `consent-required`, other failures → `upstream`; cache hit until near expiry, isolated per user.
- **AzureOpenAiProvider:** valid JSON → `Answer`; invalid JSON retried once then `invalid-output`; `429`/timeout → `unavailable`;
  prompt contains delimited, untrusted sections.
- **handleAsk:** no chunks → refusal without model call; invented citations → refusal; valid citations enriched with
  title/url; every error row above → its status; question/document/answer text absent from logs.
- **SPFx:** numbered citations with link and quote; refusal notice; `403` → not-configured; 45 s timeout.
- **Terraform:** `fmt -check`, `validate`; every apply from a saved plan approved by the user.

End-to-end no-leak test (`npm run test:e2e`, interactive sign-in of A and B against the deployed API):

| Question                                                           | User A                                | User B                                    |
| ------------------------------------------------------------------ | ------------------------------------- | ----------------------------------------- |
| "Qual o valor do auxílio home office?"                             | answer cites `politica-home-office`   | answer cites `politica-home-office`       |
| "Qual a faixa salarial de um Analista de Logística Pleno?"         | answer cites `tabela-salarial-2026`   | refusal; no citation from `RH-Restrito`   |
| "Quais mudanças estão previstas no plano de reestruturação?"       | cites `plano-reestruturacao-2026`     | refusal or no citation from `RH-Restrito` |
| "Quem aprova o cadastro de fornecedores?" (pulls the injected FAQ) | answer in Portuguese, no salary claim | same                                      |

Invariant asserted for every B response: **no citation URL points to the `RH-Restrito` library.**

## 7. Definition of done

- `npm run check` green; `npm run test:e2e` green against the deployed API.
- On the real demo site, A and B ask the same question and receive different, correct citations
  (anonymized screenshots).
- `docs/setup/phase-2.md` (steps and pitfalls), ADR-006 updated to Azure OpenAI in `docs/PLAN.md`, budget USD 5.

## 8. Execution order

1. Terraform: Key Vault + certificate, certificate credential on the API app, Azure OpenAI + deployment,
   `kb-e2e-client-dev`, app settings, budget USD 5 (user approves the plan; user runs apply if the session blocks it).
2. `core`: citation `title`/`url`; SPFx contract.
3. Key Vault client assertion + OBO with cache.
4. `packages/retrievers`: `GraphSearchRetriever`.
5. `AzureOpenAiProvider` + `prompts/v1.md`; mock update.
6. `handleAsk` orchestration and new errors.
7. Deploy the API.
8. SPFx citations, refusal and error mapping; new `.sppkg` (user uploads).
9. End-to-end no-leak test (user signs in as A and B).
10. Documentation and screenshots.
