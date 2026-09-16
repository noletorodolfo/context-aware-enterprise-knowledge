# Phase 1 — End-to-end Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A floating assistant button on the SharePoint demo site calls an authenticated Azure Functions API that returns a deterministic mock answer; unauthenticated calls get `401`.

**Architecture:** npm-workspace TypeScript monorepo. `packages/llm-providers` defines `LlmProvider` + `MockLlmProvider`. `apps/knowledge-api` is an Azure Functions v4 app whose logic lives in framework-free, unit-tested functions (`createTokenValidator`, `handleAsk`) wrapped by a thin HTTP binding and bundled with esbuild. Terraform adds a Flex Consumption Function App to `envs/dev`. `apps/spfx-assistant` is a standalone SPFx Application Customizer (outside the workspaces) rendering a React panel that calls the API through `AadHttpClient`.

**Tech Stack:** Node 22, TypeScript, Vitest, `@azure/functions` 4.x, `jose` 6.x, `zod` 4.x, esbuild, Terraform (`azurerm` ~> 5.5, `azuread` ~> 3.9), SPFx 1.22.x (Heft toolchain), React 17, Fluent UI v9, `@testing-library/react` 12.

**Spec:** `docs/superpowers/specs/2026-09-16-phase-1-end-to-end-skeleton-design.md`

## Global Constraints

- Repository content (code, identifiers, comments, docs, commit messages) is in **English**. Exceptions that stay **pt-BR**: `samples/documents/*.md` (except its README), assistant UI strings, mock answer text, the user-facing refusal text in `packages/core`.
- Commit messages: Conventional Commits, English, **no `Co-Authored-By` or any AI attribution line**. Author is the repo-local git identity.
- Nothing that identifies the partner tenant is committed: no tenant/subscription/client IDs, no `*.sharepoint.com` host of the partner, no partner domain, no real UPNs. Real values live only in git-ignored files (`*.tfvars`, `backend.hcl`, `apps/spfx-assistant/config/api.json`, `local.settings.json`).
- Node `>=22.14.0 <23`. TypeScript settings come from `tsconfig.base.json` (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `NodeNext`).
- `POST /api/ask` contract: request `{ question: string; page: { url: string; title: string; siteUrl: string; listTitle?: string } }`, response = `Answer` from `@kb/core` (`{ text; citations; refused; promptVersion }`).
- Question length: trimmed, 1–1000 characters (`MAX_QUESTION_LENGTH = 1000`).
- Token rules: RS256 signature from `https://login.microsoftonline.com/{TENANT_ID}/discovery/v2.0/keys`; `iss` = `https://login.microsoftonline.com/{TENANT_ID}/v2.0`; `aud` = `API_CLIENT_ID`; `tid` = `TENANT_ID`; `scp` contains `user_impersonation`.
- Status codes: `401` (auth), `400` (body), `500` (unhandled, with `correlationId`, no stack). Question/answer text is **never** logged.
- pt-BR UI messages (exact): unauthorized `Não foi possível autenticar. Recarregue a página.`; invalid-request `Escreva uma pergunta de até 1.000 caracteres.`; server-error `O assistente teve um problema. Tente de novo.`; unavailable `Assistente indisponível no momento.`; not-configured `Assistente não configurado neste site.`
- SPFx client timeout: 30 000 ms. Mock `promptVersion`: `"mock"`.
- Every `terraform apply` runs from a saved plan file the user has reviewed and approved in chat. Never `-auto-approve`.
- Windows + PowerShell 5.1 host: quote arguments containing `=` (e.g. `"-out=dev.tfplan"`). Terraform binary: `$env:LOCALAPPDATA\Microsoft\WinGet\Links\terraform.exe` if `terraform` is not on PATH.

---

## File Structure

```
package.json                                   modify: workspaces, scripts
tsconfig.json                                  modify: project references
vitest.config.ts                               modify: aliases, include
eslint.config.js                               modify: ignores
.prettierignore / .gitignore                   modify
README.md, docs/PLAN.md, docs/setup/*          translate / rename (Task 0)

packages/llm-providers/
  package.json, tsconfig.json
  src/provider.ts          LlmProvider interface + GenerateInput
  src/mock.ts              MockLlmProvider
  src/mock.test.ts
  src/index.ts

apps/knowledge-api/
  package.json, tsconfig.json, host.json
  local.settings.example.json
  contract-check.ts        type-level assertion SPFx contract == @kb/core
  tsconfig.contract.json
  scripts/package.mjs      esbuild bundle -> deploy/
  src/config.ts            loadConfig(env)
  src/config.test.ts
  src/auth/token-validator.ts
  src/auth/token-validator.test.ts
  src/ask/request-schema.ts
  src/ask/handle-ask.ts    framework-free handler
  src/ask/handle-ask.test.ts
  src/functions/ask.ts     @azure/functions binding
  src/main.ts              entry imported by the bundle

infra/terraform/modules/function-app/
  main.tf, variables.tf, outputs.tf
infra/terraform/envs/dev/
  main.tf, variables.tf, outputs.tf, terraform.tfvars.example   modify

apps/spfx-assistant/                            generated by yo @microsoft/sharepoint, then:
  config/api.example.json   committed; config/api.json git-ignored
  config/package-solution.json                  modify
  scripts/write-elements.mjs                    generates sharepoint/assets/elements.xml
  sharepoint/assets/elements.template.xml
  src/contract.ts
  src/api/messages.ts
  src/api/traceparent.ts
  src/api/KnowledgeApiClient.ts
  src/components/ChatPanel.tsx
  src/components/AssistantLauncher.tsx
  src/extensions/assistant/AssistantApplicationCustomizer.ts   modify
  tests/KnowledgeApiClient.test.ts
  tests/ChatPanel.test.tsx
  vitest.config.mts

docs/setup/phase-1.md
```

---

### Task 0: Translate repository to English

**Files:**

- Rename: `docs/PLANO.md` → `docs/PLAN.md`
- Rename: `docs/setup/fase-0.md` → `docs/setup/phase-0.md`
- Rename: `docs/setup/modelo-autorizacao.md` → `docs/setup/authorization-letter-template.md`
- Modify (translate): `README.md`, `docs/PLAN.md`, `docs/setup/phase-0.md`, `docs/setup/authorization-letter-template.md` (intro/instructions in English; the letter body itself stays pt-BR because it is signed by a Brazilian company — add one English sentence saying so), `samples/documents/README.md`, `infra/terraform/**/*.tf` (comments and `description` strings), `packages/core/src/*.ts` (comments, test names), `packages/core/package.json` and `tools/sample-docs/package.json` (`description`), `tools/sample-docs/src/*.ts` (comments, test names, console messages)
- Modify: `docs/superpowers/specs/2026-09-16-phase-1-end-to-end-skeleton-design.md` (reference `docs/PLAN.md`)
- Keep pt-BR: `samples/documents/*.md` except README; the refusal string in `packages/core/src/citations.ts` (`"Não encontrei essa informação nos documentos disponíveis para você."`); test fixture strings that quote synthetic documents.

**Interfaces:**

- Consumes: nothing.
- Produces: file names `docs/PLAN.md`, `docs/setup/phase-0.md` used by later tasks and by `README.md`.

- [ ] **Step 1: Rename files with git**

```bash
git mv docs/PLANO.md docs/PLAN.md
git mv docs/setup/fase-0.md docs/setup/phase-0.md
git mv docs/setup/modelo-autorizacao.md docs/setup/authorization-letter-template.md
```

- [ ] **Step 2: Translate every file listed above**

Rules: translate faithfully, keep structure, tables, code blocks, Mermaid diagrams and links. Terraform: change only comments and `description` values — do **not** change resource names, variable names, `display_name`, group names (`kb-demo-colaboradores`, `kb-demo-rh`) or any value that exists in Azure/Entra (renaming them would force replacement). Code: change only comments, test titles and log/console text; no identifier renames. In `README.md` add a "Language" note: repository in English; synthetic documents and assistant UI in pt-BR because the fictional company and its users are Brazilian. Fix intra-repo links to the renamed files.

- [ ] **Step 3: Verify no stale references and nothing Portuguese left outside the exceptions**

Run: `git grep -n -e "PLANO.md" -e "fase-0.md" -e "modelo-autorizacao.md"`
Expected: no output.

Run: `git grep -n -I -i -E "\b(não|uma|para|você|são|também)\b" -- . ":(exclude)samples/documents" ":(exclude)docs/setup/authorization-letter-template.md" ":(exclude)package-lock.json"`
Expected: only the allowed exceptions (refusal string, synthetic-document fixtures in tests, spec error-message table).

Run: `git grep -n -I -i -E "\b(não|uma|para|você)\b" -- samples/documents/README.md`
Expected: no output (the README is translated; the documents themselves stay pt-BR).

- [ ] **Step 4: Verify Terraform is unchanged in behavior**

Run (PowerShell):

```powershell
$tf = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\terraform.exe"
& $tf "-chdir=infra/terraform/bootstrap" plan -input=false -no-color -detailed-exitcode
& $tf "-chdir=infra/terraform/envs/dev" plan -input=false -no-color -detailed-exitcode
```

Expected: both print `No changes.` (exit code 0). Description-only changes on `azurerm`/`azuread` resources must not appear; variable/output descriptions never produce diffs.

- [ ] **Step 5: Run checks**

Run: `npm run check`
Expected: format, lint, typecheck pass; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: translate repository to English"
```

---

### Task 1: `packages/llm-providers` with MockLlmProvider

**Files:**

- Create: `packages/llm-providers/package.json`, `packages/llm-providers/tsconfig.json`, `packages/llm-providers/src/provider.ts`, `packages/llm-providers/src/mock.ts`, `packages/llm-providers/src/index.ts`
- Test: `packages/llm-providers/src/mock.test.ts`
- Modify: `tsconfig.json`, `vitest.config.ts`

**Interfaces:**

- Consumes: `Answer`, `Question` from `@kb/core`.
- Produces:
  - `interface GenerateInput { question: Question; user: { name: string } }`
  - `interface LlmProvider { generate(input: GenerateInput): Promise<Answer> }`
  - `const MOCK_PROMPT_VERSION = "mock"`
  - `class MockLlmProvider implements LlmProvider`

- [ ] **Step 1: Create package scaffolding**

`packages/llm-providers/package.json`:

```json
{
  "name": "@kb/llm-providers",
  "version": "0.1.0",
  "private": true,
  "description": "LLM provider abstraction and implementations (mock for now).",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsc -b"
  },
  "dependencies": {
    "@kb/core": "0.1.0"
  }
}
```

`packages/llm-providers/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"],
  "references": [{ "path": "../core" }]
}
```

Replace `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "packages/core" },
    { "path": "packages/llm-providers" },
    { "path": "tools/sample-docs" }
  ]
}
```

Replace `vitest.config.ts` (aliases let tests import workspace packages from source without building first):

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@kb/core": src("./packages/core/src/index.ts"),
      "@kb/llm-providers": src("./packages/llm-providers/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "tools/**/*.test.ts", "apps/knowledge-api/**/*.test.ts"],
  },
});
```

Run: `npm install`
Expected: `@kb/llm-providers` linked in `node_modules/@kb/`.

- [ ] **Step 2: Write the failing test**

`packages/llm-providers/src/mock.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run packages/llm-providers`
Expected: FAIL — cannot resolve `./provider.js` / `./mock.js`.

- [ ] **Step 4: Implement**

`packages/llm-providers/src/provider.ts`:

```ts
import type { Answer, Question } from "@kb/core";

export interface GenerateInput {
  question: Question;
  /** Authenticated caller, taken from the validated access token. */
  user: { name: string };
}

export interface LlmProvider {
  generate(input: GenerateInput): Promise<Answer>;
}
```

`packages/llm-providers/src/mock.ts`:

```ts
import type { Answer } from "@kb/core";
import type { GenerateInput, LlmProvider } from "./provider.js";

export const MOCK_PROMPT_VERSION = "mock";

/**
 * Deterministic provider used while the end-to-end plumbing is built.
 * The answer text is pt-BR because it is shown to end users.
 */
export class MockLlmProvider implements LlmProvider {
  generate({ question, user }: GenerateInput): Promise<Answer> {
    return Promise.resolve({
      text:
        `Olá, ${user.name}! Esta é uma resposta de teste. ` +
        `Você perguntou "${question.text}" na página "${question.page.title}".`,
      citations: [],
      refused: false,
      promptVersion: MOCK_PROMPT_VERSION,
    });
  }
}
```

`packages/llm-providers/src/index.ts`:

```ts
export type * from "./provider.js";
export * from "./mock.js";
```

- [ ] **Step 5: Run tests and checks**

Run: `npx vitest run packages/llm-providers`
Expected: PASS (2 tests).

Run: `npm run check`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/llm-providers tsconfig.json vitest.config.ts package-lock.json
git commit -m "feat(llm-providers): add LlmProvider interface and deterministic mock"
```

---

### Task 2: Knowledge API — configuration and token validation

**Files:**

- Create: `apps/knowledge-api/package.json`, `apps/knowledge-api/tsconfig.json`, `apps/knowledge-api/src/config.ts`, `apps/knowledge-api/src/auth/token-validator.ts`
- Test: `apps/knowledge-api/src/config.test.ts`, `apps/knowledge-api/src/auth/token-validator.test.ts`
- Modify: `package.json` (workspaces), `tsconfig.json` (reference)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces:
  - `interface ApiConfig { tenantId: string; apiClientId: string }`
  - `function loadConfig(env: Record<string, string | undefined>): ApiConfig` — throws `Error("Missing required setting: <NAME>")`
  - `type TokenRejectionReason = "missing-token" | "invalid-token" | "wrong-tenant" | "missing-scope"`
  - `interface AuthenticatedUser { objectId: string; name: string }`
  - `type TokenValidationResult = { ok: true; user: AuthenticatedUser } | { ok: false; reason: TokenRejectionReason }`
  - `type TokenValidator = (authorizationHeader: string | undefined) => Promise<TokenValidationResult>`
  - `interface TokenValidatorOptions { tenantId: string; audience: string; requiredScope: string; keys: JWTVerifyGetKey; clockToleranceSeconds?: number }`
  - `function createTokenValidator(options: TokenValidatorOptions): TokenValidator`
  - `function entraJwks(tenantId: string): JWTVerifyGetKey`

- [ ] **Step 1: Scaffold the workspace**

`apps/knowledge-api/package.json`:

```json
{
  "name": "@kb/knowledge-api",
  "version": "0.1.0",
  "private": true,
  "description": "Knowledge API: Azure Functions app exposing POST /api/ask.",
  "type": "module",
  "scripts": {
    "build": "tsc -b"
  },
  "dependencies": {
    "@azure/functions": "^4.16.4",
    "@kb/core": "0.1.0",
    "@kb/llm-providers": "0.1.0",
    "jose": "^6.2.12",
    "zod": "^4.6.5"
  }
}
```

`apps/knowledge-api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"],
  "exclude": ["src/**/*.test.ts"],
  "references": [{ "path": "../../packages/core" }, { "path": "../../packages/llm-providers" }]
}
```

In root `package.json` set:

```json
"workspaces": ["packages/*", "tools/*", "apps/knowledge-api"],
```

In root `tsconfig.json` add `{ "path": "apps/knowledge-api" }` to `references`.

In `eslint.config.js` replace the `no-unused-vars` rule so tests can drop claims with `const { name: _name, ...rest }`:

```js
"@typescript-eslint/no-unused-vars": [
  "error",
  { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
],
```

Run: `npm install`
Expected: installs `@azure/functions`, `jose`, `zod`; no errors.

- [ ] **Step 2: Write failing config test**

`apps/knowledge-api/src/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("reads tenant and client id", () => {
    expect(loadConfig({ TENANT_ID: "tenant-1", API_CLIENT_ID: "client-1" })).toEqual({
      tenantId: "tenant-1",
      apiClientId: "client-1",
    });
  });

  it.each(["TENANT_ID", "API_CLIENT_ID"])("throws when %s is missing or blank", (name) => {
    const env: Record<string, string | undefined> = { TENANT_ID: "t", API_CLIENT_ID: "c" };
    env[name] = " ";
    expect(() => loadConfig(env)).toThrow(`Missing required setting: ${name}`);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run apps/knowledge-api/src/config.test.ts`
Expected: FAIL — cannot resolve `./config.js`.

- [ ] **Step 4: Implement config**

`apps/knowledge-api/src/config.ts`:

```ts
export interface ApiConfig {
  tenantId: string;
  apiClientId: string;
}

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required setting: ${name}`);
  return value;
}

/** Reads app settings. The API has no secrets: only public identifiers. */
export function loadConfig(env: Record<string, string | undefined>): ApiConfig {
  return {
    tenantId: required(env, "TENANT_ID"),
    apiClientId: required(env, "API_CLIENT_ID"),
  };
}
```

Run: `npx vitest run apps/knowledge-api/src/config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write failing token validator tests**

`apps/knowledge-api/src/auth/token-validator.test.ts`:

```ts
import { beforeAll, describe, expect, it } from "vitest";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";
import { createTokenValidator, type TokenValidator } from "./token-validator.js";

const TENANT = "11111111-1111-1111-1111-111111111111";
const OTHER_TENANT = "22222222-2222-2222-2222-222222222222";
const AUDIENCE = "33333333-3333-3333-3333-333333333333";
const ISSUER = `https://login.microsoftonline.com/${TENANT}/v2.0`;

type Key = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

let signingKey: Key;
let foreignKey: Key;
let keys: JWTVerifyGetKey;
let validate: TokenValidator;

const baseClaims: JWTPayload = {
  tid: TENANT,
  oid: "user-object-id",
  name: "Test User A",
  scp: "user_impersonation",
};

async function sign(
  claims: JWTPayload = baseClaims,
  options: { key?: Key; issuer?: string; audience?: string; expiresIn?: string } = {},
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "5m")
    .sign(options.key ?? signingKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  signingKey = pair.privateKey;
  foreignKey = (await generateKeyPair("RS256")).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "RS256" };
  keys = createLocalJWKSet({ keys: [jwk] });
  validate = createTokenValidator({
    tenantId: TENANT,
    audience: AUDIENCE,
    requiredScope: "user_impersonation",
    keys,
  });
});

describe("createTokenValidator", () => {
  it("accepts a valid token and returns the user", async () => {
    const result = await validate(`Bearer ${await sign()}`);
    expect(result).toEqual({ ok: true, user: { objectId: "user-object-id", name: "Test User A" } });
  });

  it("falls back to preferred_username when name is absent", async () => {
    const { name: _name, ...claims } = baseClaims;
    const result = await validate(
      `Bearer ${await sign({ ...claims, preferred_username: "a@contoso.com" })}`,
    );
    expect(result).toEqual({
      ok: true,
      user: { objectId: "user-object-id", name: "a@contoso.com" },
    });
  });

  it.each([undefined, "", "Basic abc", "Bearer"])("rejects missing token (%s)", async (header) => {
    expect(await validate(header)).toEqual({ ok: false, reason: "missing-token" });
  });

  it("rejects an expired token", async () => {
    const token = await sign(baseClaims, { expiresIn: "-10m" });
    expect(await validate(`Bearer ${token}`)).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("rejects a token signed by an unknown key", async () => {
    const token = await sign(baseClaims, { key: foreignKey });
    expect(await validate(`Bearer ${token}`)).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("rejects a token for another audience", async () => {
    const token = await sign(baseClaims, { audience: "https://graph.microsoft.com" });
    expect(await validate(`Bearer ${token}`)).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("rejects a token from another tenant", async () => {
    const token = await sign(
      { ...baseClaims, tid: OTHER_TENANT },
      { issuer: `https://login.microsoftonline.com/${OTHER_TENANT}/v2.0` },
    );
    expect(await validate(`Bearer ${token}`)).toEqual({ ok: false, reason: "wrong-tenant" });
  });

  it("rejects a token whose issuer does not match the tenant", async () => {
    const token = await sign(baseClaims, { issuer: "https://sts.windows.net/whatever/" });
    expect(await validate(`Bearer ${token}`)).toEqual({ ok: false, reason: "invalid-token" });
  });

  it("rejects a token without the required scope", async () => {
    const token = await sign({ ...baseClaims, scp: "User.Read" });
    expect(await validate(`Bearer ${token}`)).toEqual({ ok: false, reason: "missing-scope" });
  });

  it("rejects a token without oid", async () => {
    const { oid: _oid, ...claims } = baseClaims;
    expect(await validate(`Bearer ${await sign(claims)}`)).toEqual({
      ok: false,
      reason: "invalid-token",
    });
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx vitest run apps/knowledge-api/src/auth`
Expected: FAIL — cannot resolve `./token-validator.js`.

- [ ] **Step 7: Implement the validator**

`apps/knowledge-api/src/auth/token-validator.ts`:

```ts
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

export type TokenRejectionReason =
  "missing-token" | "invalid-token" | "wrong-tenant" | "missing-scope";

export interface AuthenticatedUser {
  objectId: string;
  name: string;
}

export type TokenValidationResult =
  { ok: true; user: AuthenticatedUser } | { ok: false; reason: TokenRejectionReason };

export type TokenValidator = (
  authorizationHeader: string | undefined,
) => Promise<TokenValidationResult>;

export interface TokenValidatorOptions {
  tenantId: string;
  /** Application (client) ID of the Knowledge API; v2 access tokens use it as `aud`. */
  audience: string;
  requiredScope: string;
  keys: JWTVerifyGetKey;
  clockToleranceSeconds?: number;
}

/** Signing keys of the tenant's Entra ID v2 endpoint (cached and rotated by jose). */
export function entraJwks(tenantId: string): JWTVerifyGetKey {
  return createRemoteJWKSet(
    new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`),
  );
}

const reject = (reason: TokenRejectionReason): TokenValidationResult => ({ ok: false, reason });

export function createTokenValidator(options: TokenValidatorOptions): TokenValidator {
  const expectedIssuer = `https://login.microsoftonline.com/${options.tenantId}/v2.0`;

  return async (authorizationHeader) => {
    const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader ?? "");
    const token = match?.[1];
    if (!token) return reject("missing-token");

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, options.keys, {
        audience: options.audience,
        algorithms: ["RS256"],
        clockTolerance: options.clockToleranceSeconds ?? 60,
      }));
    } catch {
      return reject("invalid-token");
    }

    // Tenant is checked before issuer so a foreign-tenant token gets a precise reason in the logs.
    if (payload["tid"] !== options.tenantId) return reject("wrong-tenant");
    if (payload.iss !== expectedIssuer) return reject("invalid-token");

    const scopes = typeof payload["scp"] === "string" ? payload["scp"].split(" ") : [];
    if (!scopes.includes(options.requiredScope)) return reject("missing-scope");

    const objectId = payload["oid"];
    if (typeof objectId !== "string" || objectId === "") return reject("invalid-token");

    const name = [payload["name"], payload["preferred_username"]].find(
      (value): value is string => typeof value === "string" && value !== "",
    );

    return { ok: true, user: { objectId, name: name ?? "usuário" } };
  };
}
```

- [ ] **Step 8: Run tests and checks**

Run: `npx vitest run apps/knowledge-api`
Expected: PASS (config 3 + validator 13).

Run: `npm run check`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add apps/knowledge-api package.json tsconfig.json package-lock.json
git commit -m "feat(knowledge-api): add config loading and Entra ID token validation"
```

---

### Task 3: Knowledge API — request schema and `handleAsk`

**Files:**

- Create: `apps/knowledge-api/src/ask/request-schema.ts`, `apps/knowledge-api/src/ask/handle-ask.ts`
- Test: `apps/knowledge-api/src/ask/handle-ask.test.ts`

**Interfaces:**

- Consumes: `TokenValidator` (Task 2), `LlmProvider` (Task 1), `Answer`, `PageContext`, `Question` (`@kb/core`).
- Produces:
  - `const MAX_QUESTION_LENGTH = 1000`
  - `const askRequestSchema` (zod)
  - `interface AskHttpRequest { authorization: string | undefined; body: unknown }`
  - `interface AskHttpResponse { status: 200 | 400 | 401 | 500; headers: Record<string, string>; jsonBody: unknown }`
  - `interface AskLogger { info(event: string, data: Record<string, unknown>): void; warn(event: string, data: Record<string, unknown>): void; error(event: string, data: Record<string, unknown>): void }`
  - `interface AskDependencies { validateToken: TokenValidator; provider: LlmProvider; logger: AskLogger; newCorrelationId: () => string; now: () => number }`
  - `function handleAsk(request: AskHttpRequest, deps: AskDependencies): Promise<AskHttpResponse>`
  - Response bodies: 200 → `Answer`; 400 → `{ error: "invalid-request", field: string, correlationId }`; 401 → `{ error: "unauthorized", correlationId }`; 500 → `{ error: "internal-error", correlationId }`. Every response has header `x-correlation-id`.
  - Log events: `ask.unauthorized` `{ correlationId, reason }`; `ask.invalid-request` `{ correlationId, field }`; `ask.completed` `{ correlationId, status, questionLength, durationMs, promptVersion }`; `ask.failed` `{ correlationId, errorName, durationMs }`.

- [ ] **Step 1: Write failing tests**

`apps/knowledge-api/src/ask/handle-ask.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Answer } from "@kb/core";
import { MockLlmProvider, type LlmProvider } from "@kb/llm-providers";
import type { TokenValidationResult } from "../auth/token-validator.js";
import { handleAsk, type AskDependencies, type AskLogger } from "./handle-ask.js";

const QUESTION = "Qual o valor do auxílio home office?";
const validBody = {
  question: `  ${QUESTION}  `,
  page: {
    url: "https://contoso.sharepoint.com/sites/kb-demo/SitePages/Home.aspx",
    title: "Home",
    siteUrl: "https://contoso.sharepoint.com/sites/kb-demo",
  },
};

interface LogEntry {
  level: "info" | "warn" | "error";
  event: string;
  data: Record<string, unknown>;
}

function setup(overrides: { auth?: TokenValidationResult; provider?: LlmProvider } = {}) {
  const logs: LogEntry[] = [];
  const logger: AskLogger = {
    info: (event, data) => logs.push({ level: "info", event, data }),
    warn: (event, data) => logs.push({ level: "warn", event, data }),
    error: (event, data) => logs.push({ level: "error", event, data }),
  };
  let clock = 1_000;
  const deps: AskDependencies = {
    validateToken: () =>
      Promise.resolve(
        overrides.auth ?? { ok: true, user: { objectId: "oid-a", name: "Test User A" } },
      ),
    provider: overrides.provider ?? new MockLlmProvider(),
    logger,
    newCorrelationId: () => "corr-1",
    now: () => (clock += 25),
  };
  return { deps, logs };
}

describe("handleAsk", () => {
  it("returns the provider answer for an authenticated, valid request", async () => {
    const { deps, logs } = setup();
    const res = await handleAsk({ authorization: "Bearer x", body: validBody }, deps);

    expect(res.status).toBe(200);
    expect(res.headers["x-correlation-id"]).toBe("corr-1");
    const answer = res.jsonBody as Answer;
    expect(answer.text).toContain("Test User A");
    expect(answer.text).toContain(`"${QUESTION}"`);
    expect(answer.text).toContain("Home");
    expect(logs).toContainEqual({
      level: "info",
      event: "ask.completed",
      data: {
        correlationId: "corr-1",
        status: 200,
        questionLength: QUESTION.length,
        durationMs: 25,
        promptVersion: "mock",
      },
    });
  });

  it("returns 401 without details and logs the reason", async () => {
    const { deps, logs } = setup({ auth: { ok: false, reason: "wrong-tenant" } });
    const res = await handleAsk({ authorization: "Bearer x", body: validBody }, deps);

    expect(res.status).toBe(401);
    expect(res.jsonBody).toEqual({ error: "unauthorized", correlationId: "corr-1" });
    expect(logs).toContainEqual({
      level: "warn",
      event: "ask.unauthorized",
      data: { correlationId: "corr-1", reason: "wrong-tenant" },
    });
  });

  it("checks authentication before reading the body", async () => {
    const { deps } = setup({ auth: { ok: false, reason: "missing-token" } });
    const res = await handleAsk({ authorization: undefined, body: "not json" }, deps);
    expect(res.status).toBe(401);
  });

  it.each([
    ["empty question", { ...validBody, question: "   " }, "question"],
    ["question too long", { ...validBody, question: "x".repeat(1001) }, "question"],
    ["missing page", { question: QUESTION }, "page"],
    [
      "invalid page url",
      { ...validBody, page: { ...validBody.page, url: "not a url" } },
      "page.url",
    ],
    ["non-object body", undefined, ""],
  ])("returns 400 for %s", async (_label, body, field) => {
    const { deps } = setup();
    const res = await handleAsk({ authorization: "Bearer x", body }, deps);
    expect(res.status).toBe(400);
    expect(res.jsonBody).toEqual({ error: "invalid-request", field, correlationId: "corr-1" });
  });

  it("accepts exactly 1000 characters", async () => {
    const { deps } = setup();
    const res = await handleAsk(
      { authorization: "Bearer x", body: { ...validBody, question: "x".repeat(1000) } },
      deps,
    );
    expect(res.status).toBe(200);
  });

  it("returns 500 with correlation id and no stack when the provider throws", async () => {
    const failing: LlmProvider = {
      generate: () => Promise.reject(new TypeError("boom at secret/path.ts:12")),
    };
    const { deps, logs } = setup({ provider: failing });
    const res = await handleAsk({ authorization: "Bearer x", body: validBody }, deps);

    expect(res.status).toBe(500);
    expect(res.jsonBody).toEqual({ error: "internal-error", correlationId: "corr-1" });
    expect(logs).toContainEqual({
      level: "error",
      event: "ask.failed",
      data: { correlationId: "corr-1", errorName: "TypeError", durationMs: 25 },
    });
  });

  it("never writes the question or answer text to logs", async () => {
    const { deps, logs } = setup();
    await handleAsk({ authorization: "Bearer x", body: validBody }, deps);
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain(QUESTION);
    expect(serialized).not.toContain("Olá");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run apps/knowledge-api/src/ask`
Expected: FAIL — cannot resolve `./handle-ask.js`.

- [ ] **Step 3: Implement schema**

`apps/knowledge-api/src/ask/request-schema.ts`:

```ts
import { z } from "zod";

export const MAX_QUESTION_LENGTH = 1000;

export const askRequestSchema = z.object({
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
  page: z.object({
    url: z.url(),
    title: z.string().min(1),
    siteUrl: z.url(),
    listTitle: z.string().optional(),
  }),
});
```

- [ ] **Step 4: Implement handler**

`apps/knowledge-api/src/ask/handle-ask.ts`:

```ts
import type { PageContext, Question } from "@kb/core";
import type { LlmProvider } from "@kb/llm-providers";
import type { TokenValidator } from "../auth/token-validator.js";
import { askRequestSchema } from "./request-schema.js";

export interface AskHttpRequest {
  authorization: string | undefined;
  body: unknown;
}

export interface AskHttpResponse {
  status: 200 | 400 | 401 | 500;
  headers: Record<string, string>;
  jsonBody: unknown;
}

export interface AskLogger {
  info(event: string, data: Record<string, unknown>): void;
  warn(event: string, data: Record<string, unknown>): void;
  error(event: string, data: Record<string, unknown>): void;
}

export interface AskDependencies {
  validateToken: TokenValidator;
  provider: LlmProvider;
  logger: AskLogger;
  newCorrelationId: () => string;
  now: () => number;
}

/**
 * POST /api/ask, independent of the Azure Functions runtime.
 * Logs carry metadata only: question and answer text are never logged.
 */
export async function handleAsk(
  request: AskHttpRequest,
  deps: AskDependencies,
): Promise<AskHttpResponse> {
  const correlationId = deps.newCorrelationId();
  const startedAt = deps.now();
  const respond = (status: AskHttpResponse["status"], jsonBody: unknown): AskHttpResponse => ({
    status,
    headers: { "x-correlation-id": correlationId },
    jsonBody,
  });

  const auth = await deps.validateToken(request.authorization);
  if (!auth.ok) {
    deps.logger.warn("ask.unauthorized", { correlationId, reason: auth.reason });
    return respond(401, { error: "unauthorized", correlationId });
  }

  const parsed = askRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path.join(".") ?? "";
    deps.logger.warn("ask.invalid-request", { correlationId, field });
    return respond(400, { error: "invalid-request", field, correlationId });
  }

  const { question: text, page: rawPage } = parsed.data;
  const page: PageContext = {
    url: rawPage.url,
    title: rawPage.title,
    siteUrl: rawPage.siteUrl,
    ...(rawPage.listTitle !== undefined ? { listTitle: rawPage.listTitle } : {}),
  };
  const question: Question = { text, page };

  try {
    const answer = await deps.provider.generate({ question, user: { name: auth.user.name } });
    deps.logger.info("ask.completed", {
      correlationId,
      status: 200,
      questionLength: text.length,
      durationMs: deps.now() - startedAt,
      promptVersion: answer.promptVersion,
    });
    return respond(200, answer);
  } catch (error) {
    deps.logger.error("ask.failed", {
      correlationId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      durationMs: deps.now() - startedAt,
    });
    return respond(500, { error: "internal-error", correlationId });
  }
}
```

Note on the "missing page" case: zod reports path `["page"]`; "non-object body" reports an empty path → `field: ""`. If zod 4 reports a different path for either case, fix the **implementation** (e.g. map the root issue) only if the test expectation matches the spec ("`400` with the offending field"); do not weaken the test.

- [ ] **Step 5: Run tests and checks**

Run: `npx vitest run apps/knowledge-api`
Expected: PASS.

Run: `npm run check`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add apps/knowledge-api
git commit -m "feat(knowledge-api): add /ask request validation and handler"
```

---

### Task 4: Knowledge API — Functions binding, bundle and local smoke test

**Files:**

- Create: `apps/knowledge-api/src/functions/ask.ts`, `apps/knowledge-api/src/main.ts`, `apps/knowledge-api/host.json`, `apps/knowledge-api/local.settings.example.json`, `apps/knowledge-api/scripts/package.mjs`
- Modify: `apps/knowledge-api/package.json` (scripts, devDependency), `.gitignore`, `.prettierignore`, `eslint.config.js`

**Interfaces:**

- Consumes: `loadConfig` (Task 2), `createTokenValidator`, `entraJwks` (Task 2), `handleAsk`, `AskLogger` (Task 3), `MockLlmProvider` (Task 1).
- Produces: `npm run package -w @kb/knowledge-api` → folder `apps/knowledge-api/deploy/` containing `host.json`, `package.json` (`"main": "main.cjs"`, no dependencies), `main.cjs`. Function route: `POST /api/ask`, `authLevel: "anonymous"`.

- [ ] **Step 1: Install Azure Functions Core Tools and esbuild**

Run: `winget install --id Microsoft.Azure.FunctionsCoreTools -e`
Then open a new terminal (PATH refresh) and run: `func --version`
Expected: `4.x`.

Run: `npm install -D esbuild -w @kb/knowledge-api`
Expected: esbuild added to `apps/knowledge-api/package.json` devDependencies.

- [ ] **Step 2: Add binding and entry**

`apps/knowledge-api/src/functions/ask.ts`:

```ts
import { randomUUID } from "node:crypto";
import { app, type HttpRequest, type InvocationContext } from "@azure/functions";
import { MockLlmProvider } from "@kb/llm-providers";
import { createTokenValidator, entraJwks } from "../auth/token-validator.js";
import { handleAsk, type AskLogger } from "../ask/handle-ask.js";
import { loadConfig } from "../config.js";

const config = loadConfig(process.env);
const validateToken = createTokenValidator({
  tenantId: config.tenantId,
  audience: config.apiClientId,
  requiredScope: "user_impersonation",
  keys: entraJwks(config.tenantId),
});
const provider = new MockLlmProvider();

function contextLogger(context: InvocationContext): AskLogger {
  const line = (event: string, data: Record<string, unknown>) => JSON.stringify({ event, ...data });
  return {
    info: (event, data) => context.log(line(event, data)),
    warn: (event, data) => context.warn(line(event, data)),
    error: (event, data) => context.error(line(event, data)),
  };
}

async function readJson(request: HttpRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

app.http("ask", {
  methods: ["POST"],
  authLevel: "anonymous", // the handler validates the Entra ID bearer token itself
  route: "ask",
  handler: async (request, context) => {
    const response = await handleAsk(
      {
        authorization: request.headers.get("authorization") ?? undefined,
        body: await readJson(request),
      },
      {
        validateToken,
        provider,
        logger: contextLogger(context),
        newCorrelationId: randomUUID,
        now: Date.now,
      },
    );
    return { status: response.status, headers: response.headers, jsonBody: response.jsonBody };
  },
});
```

`apps/knowledge-api/src/main.ts`:

```ts
// Bundle entry point: importing a function module registers it with the Functions host.
import "./functions/ask.js";
```

`apps/knowledge-api/host.json`:

```json
{
  "version": "2.0",
  "logging": {
    "applicationInsights": {
      "samplingSettings": { "isEnabled": true, "excludedTypes": "Request" }
    }
  },
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
```

`apps/knowledge-api/local.settings.example.json`:

```json
{
  "IsEncrypted": false,
  "Values": {
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AzureWebJobsStorage": "",
    "TENANT_ID": "00000000-0000-0000-0000-000000000000",
    "API_CLIENT_ID": "00000000-0000-0000-0000-000000000000"
  }
}
```

- [ ] **Step 3: Add the packaging script**

`apps/knowledge-api/scripts/package.mjs`:

```js
// Bundles the API into a self-contained deploy/ folder. Workspace packages (@kb/*) are symlinks
// that `func azure functionapp publish` cannot follow, so everything is inlined into main.cjs.
import { build } from "esbuild";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const out = new URL("deploy/", root);

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await build({
  entryPoints: [fileURLToPath(new URL("src/main.ts", root))],
  outfile: fileURLToPath(new URL("main.cjs", out)),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  sourcemap: true,
  external: ["@azure/functions-core"], // provided by the Functions Node.js worker
});

await copyFile(new URL("host.json", root), new URL("host.json", out));
await writeFile(
  new URL("package.json", out),
  JSON.stringify({ name: "knowledge-api", version: "0.1.0", main: "main.cjs" }, null, 2),
);
console.log("Packaged to", fileURLToPath(out));
```

In `apps/knowledge-api/package.json` set `scripts`:

```json
"scripts": {
  "build": "tsc -b",
  "package": "node scripts/package.mjs"
}
```

Append to `.gitignore` (Azure Functions section):

```
apps/knowledge-api/deploy/
```

Append to `.prettierignore`:

```
apps/knowledge-api/deploy
```

In `eslint.config.js` extend `ignores` to:

```js
{ ignores: ["**/dist/**", "**/node_modules/**", "samples/dist/**", "**/*.d.ts", "apps/knowledge-api/deploy/**"] },
```

- [ ] **Step 4: Package and run locally**

```powershell
npm run package -w @kb/knowledge-api
Copy-Item apps/knowledge-api/local.settings.example.json apps/knowledge-api/deploy/local.settings.json
cd apps/knowledge-api/deploy
func start
```

Expected: host starts and lists `ask: [POST] http://localhost:7071/api/ask`. (Placeholder tenant IDs are fine: no token can validate.)

- [ ] **Step 5: Smoke-test 401 locally (second terminal)**

Run: `curl.exe -i -X POST http://localhost:7071/api/ask -H "Content-Type: application/json" -d "{}"`
Expected: `HTTP/1.1 401`, body `{"error":"unauthorized","correlationId":"…"}`, header `x-correlation-id`. Host log shows `{"event":"ask.unauthorized",…,"reason":"missing-token"}`.

Stop `func start` (Ctrl+C).

- [ ] **Step 6: Run checks and commit**

Run: `npm run check`
Expected: all green.

```bash
git add apps/knowledge-api .gitignore .prettierignore eslint.config.js package-lock.json
git commit -m "feat(knowledge-api): add Azure Functions binding and deploy bundle"
```

---

### Task 5: Terraform — Flex Consumption Function App

**Files:**

- Create: `infra/terraform/modules/function-app/main.tf`, `variables.tf`, `outputs.tf`
- Modify: `infra/terraform/envs/dev/main.tf`, `variables.tf`, `outputs.tf`, `terraform.tfvars.example`
- Local only (git-ignored): `infra/terraform/envs/dev/terraform.tfvars`

**Interfaces:**

- Consumes: `module.identity.knowledge_api_client_id` (existing output).
- Produces outputs in `envs/dev`: `function_app_name`, `function_app_url` (`https://<default_hostname>`), plus existing `identity`.

- [ ] **Step 1: Check region availability and register providers**

```powershell
$sub = "<personal subscription id from bootstrap terraform.tfvars>"
az functionapp list-flexconsumption-locations --subscription $sub --query "[].name" -o tsv
foreach ($ns in "Microsoft.Web","Microsoft.Insights","Microsoft.OperationalInsights") { az provider register --namespace $ns --subscription $sub --wait }
foreach ($ns in "Microsoft.Web","Microsoft.Insights","Microsoft.OperationalInsights") { az provider show --namespace $ns --subscription $sub --query registrationState -o tsv }
```

Expected: the location list contains `brazilsouth` (otherwise use the closest listed region, e.g. `eastus2`, as `location` in tfvars); three `Registered`.

- [ ] **Step 2: Write the module**

`infra/terraform/modules/function-app/variables.tf`:

```hcl
variable "environment" {
  description = "Environment suffix (dev, prod)."
  type        = string
}

variable "resource_group_name" {
  type = string
}

variable "location" {
  type = string
}

variable "tags" {
  type = map(string)
}

variable "tenant_id" {
  description = "Entra ID tenant whose tokens the API accepts."
  type        = string
}

variable "api_client_id" {
  description = "Application (client) ID of the Knowledge API app registration."
  type        = string
}

variable "cors_allowed_origins" {
  description = "Browser origins allowed to call the API (the SharePoint tenant origin)."
  type        = list(string)
}
```

`infra/terraform/modules/function-app/main.tf`:

```hcl
# Knowledge API hosting: Flex Consumption Function App with identity-based storage access
# (no shared keys) and workspace-based Application Insights.

terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.5"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }
}

resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

locals {
  suffix = random_string.suffix.result
}

resource "azurerm_storage_account" "host" {
  name                            = "stkbfunc${var.environment}${local.suffix}"
  resource_group_name             = var.resource_group_name
  location                        = var.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  shared_access_key_enabled       = false
  tags                            = var.tags
}

resource "azurerm_storage_container" "deployments" {
  name                  = "app-package"
  storage_account_id    = azurerm_storage_account.host.id
  container_access_type = "private"
}

resource "azurerm_log_analytics_workspace" "this" {
  name                = "log-kb-${var.environment}-${local.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  daily_quota_gb      = 0.1 # cost guardrail; far below the free 5 GB/month
  tags                = var.tags
}

resource "azurerm_application_insights" "this" {
  name                = "appi-kb-${var.environment}-${local.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  workspace_id        = azurerm_log_analytics_workspace.this.id
  application_type    = "Node.JS"
  tags                = var.tags
}

resource "azurerm_service_plan" "this" {
  name                = "asp-kb-${var.environment}-${local.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  os_type             = "Linux"
  sku_name            = "FC1"
  tags                = var.tags
}

resource "azurerm_function_app_flex_consumption" "api" {
  name                = "func-kb-api-${var.environment}-${local.suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = azurerm_service_plan.this.id

  storage_container_type      = "blobContainer"
  storage_container_endpoint  = "${azurerm_storage_account.host.primary_blob_endpoint}${azurerm_storage_container.deployments.name}"
  storage_authentication_type = "SystemAssignedIdentity"

  runtime_name           = "node"
  runtime_version        = "22"
  maximum_instance_count = 40
  instance_memory_in_mb  = 2048

  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_insights_connection_string = azurerm_application_insights.this.connection_string

    cors {
      allowed_origins = var.cors_allowed_origins
    }
  }

  app_settings = {
    AzureWebJobsStorage__accountName = azurerm_storage_account.host.name
    TENANT_ID                        = var.tenant_id
    API_CLIENT_ID                    = var.api_client_id
  }

  tags = var.tags
}

# The host reads/writes its storage and deployment package with its managed identity.
resource "azurerm_role_assignment" "host_storage" {
  scope                = azurerm_storage_account.host.id
  role_definition_name = "Storage Blob Data Owner"
  principal_id         = azurerm_function_app_flex_consumption.api.identity[0].principal_id
}
```

`infra/terraform/modules/function-app/outputs.tf`:

```hcl
output "function_app_name" {
  value = azurerm_function_app_flex_consumption.api.name
}

output "function_app_url" {
  value = "https://${azurerm_function_app_flex_consumption.api.default_hostname}"
}
```

- [ ] **Step 3: Wire it into `envs/dev`**

Replace `infra/terraform/envs/dev/main.tf`:

```hcl
terraform {
  required_version = ">= 1.9"

  # Configured in backend.hcl (generated from the bootstrap output):
  #   terraform init -backend-config=backend.hcl
  backend "azurerm" {}

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.5"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.9"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }
}

# Azure resources live in the personal subscription (ADR-011).
provider "azurerm" {
  features {}
  subscription_id     = var.subscription_id
  storage_use_azuread = true
}

# Identity lives in the partner tenant (ADR-011).
provider "azuread" {
  tenant_id = var.tenant_id
}

locals {
  tags = {
    project     = "context-aware-enterprise-knowledge"
    owner       = var.owner
    managed_by  = "terraform"
    environment = "dev"
  }
}

module "identity" {
  source = "../../modules/identity"

  environment     = "dev"
  test_user_a_upn = var.test_user_a_upn
  test_user_b_upn = var.test_user_b_upn
}

resource "azurerm_resource_group" "dev" {
  name     = "rg-kb-dev"
  location = var.location
  tags     = local.tags
}

module "function_app" {
  source = "../../modules/function-app"

  environment          = "dev"
  resource_group_name  = azurerm_resource_group.dev.name
  location             = azurerm_resource_group.dev.location
  tags                 = local.tags
  tenant_id            = var.tenant_id
  api_client_id        = module.identity.knowledge_api_client_id
  cors_allowed_origins = [var.sharepoint_origin]
}
```

Replace `infra/terraform/envs/dev/variables.tf`:

```hcl
variable "tenant_id" {
  description = "Entra ID tenant of the partner company (identity and SharePoint)."
  type        = string
}

variable "subscription_id" {
  description = "Personal Azure subscription that hosts the paid resources."
  type        = string
}

variable "location" {
  description = "Region for dev resources."
  type        = string
  default     = "brazilsouth"
}

variable "owner" {
  description = "Value of the owner tag."
  type        = string
}

variable "sharepoint_origin" {
  description = "SharePoint origin allowed by CORS, e.g. https://contoso.sharepoint.com (no trailing slash)."
  type        = string

  validation {
    condition     = can(regex("^https://[a-z0-9-]+\\.sharepoint\\.com$", var.sharepoint_origin))
    error_message = "sharepoint_origin must look like https://<tenant>.sharepoint.com with no trailing slash."
  }
}

variable "test_user_a_upn" {
  type = string
}

variable "test_user_b_upn" {
  type = string
}
```

Replace `infra/terraform/envs/dev/outputs.tf`:

```hcl
output "identity" {
  value = module.identity
}

output "function_app_name" {
  value = module.function_app.function_app_name
}

output "function_app_url" {
  value = module.function_app.function_app_url
}
```

Replace `infra/terraform/envs/dev/terraform.tfvars.example`:

```hcl
tenant_id         = "00000000-0000-0000-0000-000000000000"
subscription_id   = "00000000-0000-0000-0000-000000000000"
owner             = "your-github-username"
sharepoint_origin = "https://contoso.sharepoint.com"
test_user_a_upn   = "kb.test.a@contoso.com"
test_user_b_upn   = "kb.test.b@contoso.com"
```

Add to the **local** `infra/terraform/envs/dev/terraform.tfvars` (values from the bootstrap tfvars and the partner tenant; never committed): `subscription_id`, `owner`, `sharepoint_origin` (and `location` only if Step 1 required another region).

- [ ] **Step 4: Init, format, validate**

```powershell
$tf = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\terraform.exe"
& $tf "-chdir=infra/terraform/envs/dev" init -input=false -no-color "-backend-config=backend.hcl"
& $tf "-chdir=infra/terraform" fmt -recursive -check
& $tf "-chdir=infra/terraform/envs/dev" validate -no-color
```

Expected: init adds `hashicorp/azurerm` to the lock file; `fmt` prints nothing; `Success! The configuration is valid.`

If `validate` reports an unsupported argument on `azurerm_function_app_flex_consumption` (the resource is recent and its schema moves), open the provider docs for the locked version (`registry.terraform.io/providers/hashicorp/azurerm/<version>/docs/resources/function_app_flex_consumption`) and adjust **only** the offending argument names, keeping the spec behavior: identity-based storage, Node 22, CORS limited to `sharepoint_origin`, App Insights connection, `TENANT_ID`/`API_CLIENT_ID` settings.

- [ ] **Step 5: Plan and hand over for review (STOP)**

```powershell
& $tf "-chdir=infra/terraform/envs/dev" plan -input=false -no-color "-out=dev.tfplan"
```

Expected: only **additions** (`random_string`, resource group, storage account + container, Log Analytics, App Insights, service plan `FC1`, Flex Consumption app, role assignment); **0 to change, 0 to destroy** on the existing identity resources.

Summarize the plan for the user in chat (resources, region, SKUs, CORS origin redacted in any committed text) and **wait for explicit approval**.

- [ ] **Step 6: Apply the reviewed plan**

```powershell
& $tf "-chdir=infra/terraform/envs/dev" apply -input=false -no-color dev.tfplan
Remove-Item infra/terraform/envs/dev/dev.tfplan
& $tf "-chdir=infra/terraform/envs/dev" plan -input=false -no-color -detailed-exitcode
```

Expected: apply completes; follow-up plan prints `No changes.` If the role assignment fails with a principal-not-found error (identity replication delay), wait one minute and re-run plan + apply from a new saved plan.

Verify settings:

```powershell
$tf = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\terraform.exe"
$name = & $tf "-chdir=infra/terraform/envs/dev" output -raw function_app_name
az functionapp config appsettings list -g rg-kb-dev -n $name --query "[].name" -o tsv
```

Expected: includes `AzureWebJobsStorage__accountName`, `TENANT_ID`, `API_CLIENT_ID`, `APPLICATIONINSIGHTS_CONNECTION_STRING`; **no** `AzureWebJobsStorage` containing an account key.

- [ ] **Step 7: Commit**

```bash
git add infra/terraform
git commit -m "feat(infra): add Flex Consumption function app module for the Knowledge API"
```

---

### Task 6: Deploy the API and verify `401` in Azure

**Files:**

- Create: `docs/setup/phase-1.md` (started here, completed in Task 10)

**Interfaces:**

- Consumes: `deploy/` bundle (Task 4), `function_app_name` / `function_app_url` outputs (Task 5).
- Produces: a live endpoint `<function_app_url>/api/ask`.

- [ ] **Step 1: Publish**

```powershell
$tf = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\terraform.exe"
npm run package -w @kb/knowledge-api
$name = & $tf "-chdir=infra/terraform/envs/dev" output -raw function_app_name
cd apps/knowledge-api/deploy
func azure functionapp publish $name
cd ../../..
```

Expected: `Deployment successful` and `ask - [httpTrigger] Invoke url: https://<host>/api/ask`.

- [ ] **Step 2: `401` without token**

```powershell
$url = & $tf "-chdir=infra/terraform/envs/dev" output -raw function_app_url
curl.exe -i -X POST "$url/api/ask" -H "Content-Type: application/json" -d "{}"
```

Expected: `HTTP/1.1 401`, body `{"error":"unauthorized","correlationId":"…"}`.

If the response is `500`/`503` instead, check startup errors: `az monitor app-insights query` is not needed — use `func azure functionapp logstream $name` and fix the cause (typical: missing app setting → `Missing required setting`, or storage role not yet effective → wait and restart with `az functionapp restart -g rg-kb-dev -n $name`).

- [ ] **Step 3: `401` with a token for another audience (Microsoft Graph)**

```powershell
$tid = "<partner tenant id from envs/dev terraform.tfvars>"
$graph = az account get-access-token --tenant $tid --resource-type ms-graph --query accessToken -o tsv
curl.exe -i -X POST "$url/api/ask" -H "Content-Type: application/json" -H "Authorization: Bearer $graph" -d "{}"
```

Expected: `HTTP/1.1 401`. Log stream shows `"reason":"invalid-token"`.

- [ ] **Step 4: Start `docs/setup/phase-1.md`**

Create the file with this skeleton and the verified commands from Tasks 4–6 filled in (English, no partner identifiers; use `<function-app-name>`, `<tenant-id>` placeholders):

```markdown
# Phase 1 — End-to-end skeleton: runbook

Definition of done: see the spec, section 5.

## Checklist

| #   | Item                                             | Where        | Status |
| --- | ------------------------------------------------ | ------------ | ------ |
| 1   | Azure Functions Core Tools installed             | Local        | ✅     |
| 2   | Function App provisioned (`envs/dev`)            | Subscription | ✅     |
| 3   | API deployed, `401` without / with foreign token | Azure        | ✅     |
| 4   | SPFx package built                               | Local        | ⬜     |
| 5   | Package uploaded, API access approved            | SharePoint   | ⬜     |
| 6   | App added to the demo site only                  | SharePoint   | ⬜     |
| 7   | Acceptance tests with users A and B              | SharePoint   | ⬜     |

## Provision

## Deploy the API

## Verify

## Pitfalls
```

- [ ] **Step 5: Commit**

```bash
git add docs/setup/phase-1.md
git commit -m "docs: add Phase 1 runbook with API deployment steps"
```

---

### Task 7: SPFx — scaffold, contract and configuration

**Files:**

- Create (generator): `apps/spfx-assistant/**`
- Create: `apps/spfx-assistant/src/contract.ts`, `apps/spfx-assistant/config/api.example.json`, `apps/spfx-assistant/sharepoint/assets/elements.template.xml`, `apps/spfx-assistant/scripts/write-elements.mjs`, `apps/knowledge-api/contract-check.ts`, `apps/knowledge-api/tsconfig.contract.json`
- Modify: `apps/spfx-assistant/config/package-solution.json`, `apps/spfx-assistant/package.json`, root `package.json` (scripts), `.gitignore`, `.prettierignore`, `eslint.config.js`

**Interfaces:**

- Consumes: `Answer`, `PageContext` from `@kb/core` (type-level only).
- Produces:
  - `interface PageContextDto { url: string; title: string; siteUrl: string; listTitle?: string }`
  - `interface AskRequest { question: string; page: PageContextDto }`
  - `interface CitationDto { chunkId: string; quote: string }`
  - `interface AskResponse { text: string; citations: CitationDto[]; refused: boolean; promptVersion: string }`
  - `interface IAssistantApplicationCustomizerProperties { apiBaseUrl: string; apiResource: string }` (in the customizer file)
  - Config file shape `config/api.json`: `{ "apiBaseUrl": "https://<function-app>.azurewebsites.net", "apiResource": "api://<api-client-id>" }`

- [ ] **Step 1: Scaffold**

```powershell
npm install -g @microsoft/generator-sharepoint@1.22.2 yo
cd apps
yo @microsoft/sharepoint --solution-name spfx-assistant --component-type extension --extension-type ApplicationCustomizer --component-name Assistant --skip-install --no-insight
cd spfx-assistant
npm install
npm run build
```

Expected: folder `apps/spfx-assistant` with `src/extensions/assistant/AssistantApplicationCustomizer.ts`, `config/package-solution.json`, `sharepoint/assets/elements.xml`; build succeeds. If the generator prompts despite the flags, answer: solution name `spfx-assistant`, component type Extension → Application Customizer, name `Assistant`. Note the actual scripts in `package.json` (Heft-based: `build`, `start`, `clean`, `package-solution` or similar) and record them in `docs/setup/phase-1.md`.

Add dependencies (React version must match what SPFx 1.22 expects; the generator's React web part template uses 17.0.1):

```powershell
npm install react@17.0.1 react-dom@17.0.1 @fluentui/react-components@^9.74.7
npm install -D @types/react@17.0.45 @types/react-dom@17.0.17 vitest@^5.0.0 jsdom @testing-library/react@12.1.5
```

- [ ] **Step 2: Contract**

`apps/spfx-assistant/src/contract.ts`:

```ts
// Wire contract of POST /api/ask. Duplicated from @kb/core on purpose (SPFx builds outside the
// npm workspaces); apps/knowledge-api/contract-check.ts fails the typecheck if they drift.

export interface PageContextDto {
  url: string;
  title: string;
  siteUrl: string;
  listTitle?: string;
}

export interface AskRequest {
  question: string;
  page: PageContextDto;
}

export interface CitationDto {
  chunkId: string;
  quote: string;
}

export interface AskResponse {
  text: string;
  citations: CitationDto[];
  refused: boolean;
  promptVersion: string;
}
```

`apps/knowledge-api/contract-check.ts`:

```ts
// Type-level test: the SPFx wire contract must stay identical to the API domain types.
import type { Answer, PageContext } from "@kb/core";
import type { AskRequest, AskResponse, PageContextDto } from "../spfx-assistant/src/contract.js";

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type PageContextMatches = Assert<Equal<PageContextDto, PageContext>>;
export type ResponseMatches = Assert<Equal<AskResponse, Answer>>;
export type RequestMatches = Assert<Equal<AskRequest, { question: string; page: PageContext }>>;
```

`apps/knowledge-api/tsconfig.contract.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "declaration": false,
    "noEmit": true
  },
  "include": ["contract-check.ts"]
}
```

Root `package.json` scripts:

```json
"typecheck": "tsc -b && tsc -p apps/knowledge-api/tsconfig.contract.json",
"test:spfx": "npm --prefix apps/spfx-assistant run test:unit",
"check": "npm run format:check && npm run lint && npm run typecheck && npm test && npm run test:spfx"
```

- [ ] **Step 3: Verify the contract check catches drift**

Temporarily change `promptVersion: string;` to `promptVersion: number;` in `apps/spfx-assistant/src/contract.ts`.
Run: `npm run typecheck`
Expected: FAIL in `contract-check.ts` (`Type 'false' does not satisfy the constraint 'true'`).
Revert the change. Run: `npm run typecheck` → PASS.

- [ ] **Step 4: Configuration → elements.xml**

`apps/spfx-assistant/config/api.example.json`:

```json
{
  "apiBaseUrl": "https://func-kb-api-dev-xxxxxx.azurewebsites.net",
  "apiResource": "api://00000000-0000-0000-0000-000000000000"
}
```

`apps/spfx-assistant/sharepoint/assets/elements.template.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<Elements xmlns="http://schemas.microsoft.com/sharepoint/">
  <CustomAction
    Title="Knowledge Assistant"
    Location="ClientSideExtension.ApplicationCustomizer"
    ClientSideComponentId="{{componentId}}"
    ClientSideComponentProperties="{{properties}}" />
</Elements>
```

`apps/spfx-assistant/scripts/write-elements.mjs`:

```js
// Generates sharepoint/assets/elements.xml from the git-ignored config/api.json so the public
// repository never contains the partner's API URL or client id.
import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

let config;
try {
  config = JSON.parse(await read("config/api.json"));
} catch {
  console.error("Missing config/api.json. Copy config/api.example.json and fill in real values.");
  process.exit(1);
}
for (const key of ["apiBaseUrl", "apiResource"]) {
  if (typeof config[key] !== "string" || config[key] === "") {
    console.error(`config/api.json: "${key}" is required.`);
    process.exit(1);
  }
}

const manifest = await read(
  "src/extensions/assistant/AssistantApplicationCustomizer.manifest.json",
);
const componentId = /"id"\s*:\s*"([0-9a-f-]{36})"/i.exec(manifest)?.[1];
if (!componentId) {
  console.error("Could not find the component id in the customizer manifest.");
  process.exit(1);
}

const escapeXml = (s) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const properties = escapeXml(
  JSON.stringify({
    apiBaseUrl: config.apiBaseUrl.replace(/\/$/, ""),
    apiResource: config.apiResource,
  }),
);

const xml = (await read("sharepoint/assets/elements.template.xml"))
  .replace("{{componentId}}", componentId)
  .replace("{{properties}}", properties);
await writeFile(new URL("sharepoint/assets/elements.xml", root), xml);
console.log("Wrote sharepoint/assets/elements.xml");
```

In `apps/spfx-assistant/package.json` add scripts (keep generated ones):

```json
"elements": "node scripts/write-elements.mjs",
"test:unit": "vitest run"
```

Append to root `.gitignore`:

```
# SPFx local configuration and generated artifacts
apps/spfx-assistant/config/api.json
apps/spfx-assistant/sharepoint/assets/elements.xml
apps/spfx-assistant/sharepoint/solution/
apps/spfx-assistant/temp/
apps/spfx-assistant/lib/
apps/spfx-assistant/release/
```

Append to `.prettierignore`:

```
apps/spfx-assistant
```

In `eslint.config.js` add `"apps/spfx-assistant/**"` to `ignores` (SPFx lints itself during its build).

- [ ] **Step 5: package-solution.json**

In `apps/spfx-assistant/config/package-solution.json`, keep generated ids/versions and set:

- `"skipFeatureDeployment": false`
- `"includeClientSideAssets": true`
- inside `"solution"`: `"webApiPermissionRequests": [{ "resource": "kb-knowledge-api-dev", "scope": "user_impersonation" }]`
- in `features[0].assets.elementManifests` keep only `"elements.xml"`; remove `"ClientSideInstance.xml"` from `elementManifests` (that file drives tenant-wide deployment, which must not happen) and delete `sharepoint/assets/ClientSideInstance.xml`.

- [ ] **Step 6: Generate and build**

```powershell
Copy-Item config/api.example.json config/api.json   # then edit with real values from terraform outputs
npm run elements
npm run build
```

Expected: `Wrote sharepoint/assets/elements.xml`; build succeeds. `git status` shows neither `config/api.json` nor `elements.xml`.

- [ ] **Step 7: Commit**

```bash
git add apps/spfx-assistant apps/knowledge-api/contract-check.ts apps/knowledge-api/tsconfig.contract.json package.json .gitignore .prettierignore eslint.config.js
git commit -m "feat(spfx): scaffold application customizer with wire contract and local config"
```

Before committing run `git diff --cached | Select-String -Pattern "sharepoint.com|azurewebsites.net"` and confirm only `contoso`/`xxxxxx` placeholders appear.

---

### Task 8: SPFx — `KnowledgeApiClient`

**Files:**

- Create: `apps/spfx-assistant/src/api/messages.ts`, `apps/spfx-assistant/src/api/traceparent.ts`, `apps/spfx-assistant/src/api/KnowledgeApiClient.ts`, `apps/spfx-assistant/vitest.config.mts`
- Test: `apps/spfx-assistant/tests/KnowledgeApiClient.test.ts`

**Interfaces:**

- Consumes: `AskRequest`, `AskResponse` (Task 7).
- Produces:
  - `type AskErrorKind = "unauthorized" | "invalid-request" | "server-error" | "unavailable" | "not-configured"`
  - `const errorMessages: Record<AskErrorKind, string>` (exact pt-BR strings from Global Constraints)
  - `const MAX_QUESTION_LENGTH = 1000`
  - `function newTraceparent(): string` → `00-<32 hex>-<16 hex>-01`
  - `interface HttpPoster { post(url: string, init: { headers: Record<string, string>; body: string }): Promise<{ status: number; json(): Promise<unknown> }> }`
  - `type AskResult = { ok: true; answer: AskResponse } | { ok: false; error: AskErrorKind }`
  - `interface KnowledgeApiClientOptions { baseUrl: string; getHttp: () => Promise<HttpPoster>; timeoutMs?: number; newTraceparent?: () => string }`
  - `class KnowledgeApiClient { constructor(options: KnowledgeApiClientOptions); ask(request: AskRequest): Promise<AskResult> }`
  - `interface AskClient { ask(request: AskRequest): Promise<AskResult> }`

- [ ] **Step 1: Vitest config for the SPFx folder**

`apps/spfx-assistant/vitest.config.mts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "jsdom",
  },
});
```

- [ ] **Step 2: Write failing tests**

`apps/spfx-assistant/tests/KnowledgeApiClient.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { KnowledgeApiClient, type HttpPoster } from "../src/api/KnowledgeApiClient";
import { errorMessages } from "../src/api/messages";
import { newTraceparent } from "../src/api/traceparent";
import type { AskRequest, AskResponse } from "../src/contract";

const request: AskRequest = {
  question: "Qual o valor do auxílio?",
  page: {
    url: "https://contoso.sharepoint.com/sites/kb-demo",
    title: "Home",
    siteUrl: "https://contoso.sharepoint.com/sites/kb-demo",
  },
};
const answer: AskResponse = { text: "ok", citations: [], refused: false, promptVersion: "mock" };

function poster(
  response: { status: number; body?: unknown } | Error,
): HttpPoster & { calls: Parameters<HttpPoster["post"]>[] } {
  const calls: Parameters<HttpPoster["post"]>[] = [];
  return {
    calls,
    post: (url, init) => {
      calls.push([url, init]);
      if (response instanceof Error) return Promise.reject(response);
      return Promise.resolve({
        status: response.status,
        json: () => Promise.resolve(response.body),
      });
    },
  };
}

const client = (http: HttpPoster | Promise<HttpPoster>, timeoutMs = 30_000) =>
  new KnowledgeApiClient({
    baseUrl: "https://api.example.net",
    getHttp: () => Promise.resolve(http),
    timeoutMs,
    newTraceparent: () => "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
  });

describe("KnowledgeApiClient", () => {
  it("posts JSON with traceparent to /api/ask and returns the answer", async () => {
    const http = poster({ status: 200, body: answer });
    const result = await client(http).ask(request);

    expect(result).toEqual({ ok: true, answer });
    expect(http.calls).toHaveLength(1);
    const [url, init] = http.calls[0]!;
    expect(url).toBe("https://api.example.net/api/ask");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
    });
    expect(JSON.parse(init.body)).toEqual(request);
  });

  it.each([
    [400, "invalid-request"],
    [401, "unauthorized"],
    [403, "unauthorized"],
    [500, "server-error"],
    [502, "unavailable"],
    [503, "unavailable"],
    [504, "unavailable"],
    [404, "server-error"],
  ] as const)("maps HTTP %i to %s", async (status, error) => {
    expect(await client(poster({ status })).ask(request)).toEqual({ ok: false, error });
  });

  it("maps a network failure to unavailable", async () => {
    expect(await client(poster(new TypeError("Failed to fetch"))).ask(request)).toEqual({
      ok: false,
      error: "unavailable",
    });
  });

  it("maps a token acquisition failure during post to not-configured", async () => {
    const http = poster(new Error("AADSTS65001: The user or administrator has not consented"));
    expect(await client(http).ask(request)).toEqual({ ok: false, error: "not-configured" });
  });

  it("maps a failure to create the AAD client to not-configured", async () => {
    const failing = new KnowledgeApiClient({
      baseUrl: "https://api.example.net",
      getHttp: () => Promise.reject(new Error("no")),
    });
    expect(await failing.ask(request)).toEqual({ ok: false, error: "not-configured" });
  });

  it("times out as unavailable", async () => {
    vi.useFakeTimers();
    const hanging: HttpPoster = { post: () => new Promise(() => undefined) };
    const pending = client(hanging, 30_000).ask(request);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toEqual({ ok: false, error: "unavailable" });
    vi.useRealTimers();
  });
});

describe("messages and traceparent", () => {
  it("has the exact pt-BR messages", () => {
    expect(errorMessages).toEqual({
      unauthorized: "Não foi possível autenticar. Recarregue a página.",
      "invalid-request": "Escreva uma pergunta de até 1.000 caracteres.",
      "server-error": "O assistente teve um problema. Tente de novo.",
      unavailable: "Assistente indisponível no momento.",
      "not-configured": "Assistente não configurado neste site.",
    });
  });

  it("generates W3C traceparent values", () => {
    const value = newTraceparent();
    expect(value).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    expect(newTraceparent()).not.toBe(value);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run (in `apps/spfx-assistant`): `npm run test:unit`
Expected: FAIL — cannot resolve `../src/api/KnowledgeApiClient`.

- [ ] **Step 4: Implement**

`apps/spfx-assistant/src/api/messages.ts`:

```ts
export type AskErrorKind =
  "unauthorized" | "invalid-request" | "server-error" | "unavailable" | "not-configured";

export const MAX_QUESTION_LENGTH = 1000;

/** User-facing messages (pt-BR: the assistant's users are Brazilian). */
export const errorMessages: Record<AskErrorKind, string> = {
  unauthorized: "Não foi possível autenticar. Recarregue a página.",
  "invalid-request": "Escreva uma pergunta de até 1.000 caracteres.",
  "server-error": "O assistente teve um problema. Tente de novo.",
  unavailable: "Assistente indisponível no momento.",
  "not-configured": "Assistente não configurado neste site.",
};
```

`apps/spfx-assistant/src/api/traceparent.ts`:

```ts
function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** W3C Trace Context header: version-traceId-parentId-flags (sampled). */
export function newTraceparent(): string {
  return `00-${randomHex(16)}-${randomHex(8)}-01`;
}
```

`apps/spfx-assistant/src/api/KnowledgeApiClient.ts`:

```ts
import type { AskRequest, AskResponse } from "../contract";
import type { AskErrorKind } from "./messages";
import { newTraceparent as defaultTraceparent } from "./traceparent";

export interface HttpPoster {
  post(
    url: string,
    init: { headers: Record<string, string>; body: string },
  ): Promise<{ status: number; json(): Promise<unknown> }>;
}

export type AskResult = { ok: true; answer: AskResponse } | { ok: false; error: AskErrorKind };

export interface AskClient {
  ask(request: AskRequest): Promise<AskResult>;
}

export interface KnowledgeApiClientOptions {
  baseUrl: string;
  /** Resolves the AAD-authenticated HTTP client; rejects when the API permission is not usable. */
  getHttp: () => Promise<HttpPoster>;
  timeoutMs?: number;
  newTraceparent?: () => string;
}

const TIMEOUT = Symbol("timeout");
const TOKEN_ERROR = /AADSTS|consent|token/i;

function statusToError(status: number): AskErrorKind {
  if (status === 400) return "invalid-request";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 502 || status === 503 || status === 504) return "unavailable";
  return "server-error";
}

export class KnowledgeApiClient implements AskClient {
  private readonly options: KnowledgeApiClientOptions;

  public constructor(options: KnowledgeApiClientOptions) {
    this.options = options;
  }

  public async ask(request: AskRequest): Promise<AskResult> {
    let http: HttpPoster;
    try {
      http = await this.options.getHttp();
    } catch {
      return { ok: false, error: "not-configured" };
    }

    const timeoutMs = this.options.timeoutMs ?? 30000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMEOUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
    });

    try {
      const response = await Promise.race([
        http.post(`${this.options.baseUrl.replace(/\/$/, "")}/api/ask`, {
          headers: {
            "Content-Type": "application/json",
            traceparent: (this.options.newTraceparent ?? defaultTraceparent)(),
          },
          body: JSON.stringify(request),
        }),
        timeout,
      ]);
      if (response === TIMEOUT) return { ok: false, error: "unavailable" };
      if (response.status === 200)
        return { ok: true, answer: (await response.json()) as AskResponse };
      return { ok: false, error: statusToError(response.status) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: TOKEN_ERROR.test(message) ? "not-configured" : "unavailable" };
    } finally {
      clearTimeout(timer);
    }
  }
}
```

- [ ] **Step 5: Run tests and SPFx build**

Run (in `apps/spfx-assistant`): `npm run test:unit`
Expected: PASS.

Run: `npm run build`
Expected: SPFx build (TypeScript + lint) passes. If the SPFx lint rejects a construct (e.g. explicit member accessibility or `Symbol` typing), adjust the code style to satisfy the SPFx lint config without changing behavior, then re-run tests.

- [ ] **Step 6: Commit**

```bash
git add apps/spfx-assistant
git commit -m "feat(spfx): add Knowledge API client with error mapping and traceparent"
```

---

### Task 9: SPFx — launcher, chat panel and customizer wiring

**Files:**

- Create: `apps/spfx-assistant/src/components/ChatPanel.tsx`, `apps/spfx-assistant/src/components/AssistantLauncher.tsx`
- Modify: `apps/spfx-assistant/src/extensions/assistant/AssistantApplicationCustomizer.ts`
- Test: `apps/spfx-assistant/tests/ChatPanel.test.tsx`

**Interfaces:**

- Consumes: `AskClient`, `AskResult` (Task 8), `errorMessages`, `MAX_QUESTION_LENGTH` (Task 8), `AskRequest`, `PageContextDto` (Task 7).
- Produces:
  - `interface ChatPanelProps { id: string; client: AskClient; getPage: () => PageContextDto; onClose: () => void }`
  - `function ChatPanel(props: ChatPanelProps): JSX.Element`
  - `interface AssistantLauncherProps { client: AskClient; getPage: () => PageContextDto }`
  - `function AssistantLauncher(props: AssistantLauncherProps): JSX.Element`
  - UI contract used by tests: textarea labelled `Sua pergunta`; submit button `Enviar`; retry button `Tentar de novo`; close button `Fechar assistente`; launcher button `Abrir assistente`; live region `role="status"`; mock badge text `Resposta de teste`.

- [ ] **Step 1: Write failing tests**

`apps/spfx-assistant/tests/ChatPanel.test.tsx`:

```tsx
import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AskClient, AskResult } from "../src/api/KnowledgeApiClient";
import { ChatPanel } from "../src/components/ChatPanel";
import { AssistantLauncher } from "../src/components/AssistantLauncher";

const page = {
  url: "https://contoso.sharepoint.com/sites/kb-demo",
  title: "Home",
  siteUrl: "https://contoso.sharepoint.com/sites/kb-demo",
};
const mockAnswer: AskResult = {
  ok: true,
  answer: {
    text: "Olá, A! Esta é uma resposta de teste.",
    citations: [],
    refused: false,
    promptVersion: "mock",
  },
};

function fakeClient(...results: AskResult[]): AskClient & { ask: ReturnType<typeof vi.fn> } {
  const ask = vi.fn();
  for (const r of results) ask.mockResolvedValueOnce(r);
  return { ask };
}

function renderPanel(client: AskClient, onClose = vi.fn()) {
  render(<ChatPanel id="kb-panel" client={client} getPage={() => page} onClose={onClose} />);
  return { onClose, input: screen.getByLabelText("Sua pergunta") as HTMLTextAreaElement };
}

function ask(input: HTMLTextAreaElement, text: string) {
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
}

afterEach(cleanup);

describe("ChatPanel", () => {
  it("moves focus to the question input when opened", () => {
    const { input } = renderPanel(fakeClient());
    expect(document.activeElement).toBe(input);
  });

  it("closes on Escape", () => {
    const { onClose } = renderPanel(fakeClient());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sends the trimmed question with page context and announces the answer with a test badge", async () => {
    const client = fakeClient(mockAnswer);
    const { input } = renderPanel(client);
    ask(input, "  Qual o auxílio?  ");

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Esta é uma resposta de teste."),
    );
    expect(client.ask).toHaveBeenCalledWith({ question: "Qual o auxílio?", page });
    expect(screen.getByText("Resposta de teste")).toBeTruthy();
  });

  it("shows the mapped error and retries the same question", async () => {
    const client = fakeClient({ ok: false, error: "unavailable" }, mockAnswer);
    const { input } = renderPanel(client);
    ask(input, "Qual o auxílio?");

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Assistente indisponível no momento.",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Esta é uma resposta de teste."),
    );
    expect(client.ask).toHaveBeenCalledTimes(2);
    expect(client.ask.mock.calls[1]?.[0]).toEqual({ question: "Qual o auxílio?", page });
  });

  it("rejects questions over 1000 characters without calling the API", async () => {
    const client = fakeClient();
    const { input } = renderPanel(client);
    ask(input, "x".repeat(1001));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Escreva uma pergunta de até 1.000 caracteres.",
      ),
    );
    expect(client.ask).not.toHaveBeenCalled();
  });

  it("ignores empty questions", () => {
    const client = fakeClient();
    const { input } = renderPanel(client);
    ask(input, "   ");
    expect(client.ask).not.toHaveBeenCalled();
  });
});

describe("AssistantLauncher", () => {
  it("opens the panel and returns focus to the button when closed with Escape", () => {
    render(<AssistantLauncher client={fakeClient()} getPage={() => page} />);
    const button = screen.getByRole("button", { name: "Abrir assistente" });
    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run (in `apps/spfx-assistant`): `npm run test:unit -- tests/ChatPanel.test.tsx`
Expected: FAIL — cannot resolve `../src/components/ChatPanel`.

- [ ] **Step 3: Implement ChatPanel**

`apps/spfx-assistant/src/components/ChatPanel.tsx`:

```tsx
import * as React from "react";
import { Badge, Button, Spinner, Textarea } from "@fluentui/react-components";
import type { AskClient } from "../api/KnowledgeApiClient";
import { errorMessages, MAX_QUESTION_LENGTH } from "../api/messages";
import type { PageContextDto } from "../contract";

export interface ChatPanelProps {
  id: string;
  client: AskClient;
  getPage: () => PageContextDto;
  onClose: () => void;
}

type Message =
  | { kind: "question"; text: string }
  | { kind: "answer"; text: string; isMock: boolean }
  | { kind: "error"; text: string; retryQuestion?: string };

const panelStyle: React.CSSProperties = {
  position: "fixed",
  right: 24,
  bottom: 88,
  width: "min(380px, calc(100vw - 48px))",
  maxHeight: "min(560px, calc(100vh - 120px))",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 16,
  background: "#fff",
  borderRadius: 8,
  boxShadow: "0 8px 24px rgba(0,0,0,.2)",
  zIndex: 1000,
};

export function ChatPanel({ id, client, getPage, onClose }: ChatPanelProps): JSX.Element {
  const [draft, setDraft] = React.useState("");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [sending, setSending] = React.useState(false);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = async (question: string): Promise<void> => {
    setSending(true);
    const result = await client.ask({ question, page: getPage() });
    setSending(false);
    setMessages((current) => [
      ...current,
      result.ok
        ? {
            kind: "answer",
            text: result.answer.text,
            isMock: result.answer.promptVersion === "mock",
          }
        : { kind: "error", text: errorMessages[result.error], retryQuestion: question },
    ]);
  };

  const submit = (): void => {
    const question = draft.trim();
    if (question === "" || sending) return;
    if (question.length > MAX_QUESTION_LENGTH) {
      setMessages((current) => [
        ...current,
        { kind: "error", text: errorMessages["invalid-request"] },
      ]);
      return;
    }
    setDraft("");
    setMessages((current) => [...current, { kind: "question", text: question }]);
    void send(question);
  };

  const last = messages[messages.length - 1];
  const announcement = last && last.kind !== "question" ? last.text : "";

  return (
    <div
      id={id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${id}-title`}
      style={panelStyle}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 id={`${id}-title`} style={{ margin: 0, fontSize: 16 }}>
          Assistente de conhecimento
        </h2>
        <Button appearance="subtle" aria-label="Fechar assistente" onClick={onClose}>
          ✕
        </Button>
      </div>

      <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.map((message, index) => (
          <div
            key={index}
            style={{ alignSelf: message.kind === "question" ? "flex-end" : "flex-start" }}
          >
            {message.kind === "answer" && message.isMock && (
              <Badge appearance="outline">Resposta de teste</Badge>
            )}
            <p style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>{message.text}</p>
            {message.kind === "error" && message.retryQuestion !== undefined && (
              <Button
                size="small"
                disabled={sending}
                onClick={() => {
                  if (message.retryQuestion !== undefined) void send(message.retryQuestion);
                }}
              >
                Tentar de novo
              </Button>
            )}
          </div>
        ))}
        {sending && <Spinner size="tiny" label="Consultando…" />}
      </div>

      <div
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
        }}
      >
        {announcement}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <Textarea
          ref={inputRef}
          aria-label="Sua pergunta"
          value={draft}
          resize="vertical"
          style={{ flex: 1 }}
          onChange={(_event, data) => setDraft(data.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button type="submit" appearance="primary" disabled={sending}>
          Enviar
        </Button>
      </form>
    </div>
  );
}
```

`apps/spfx-assistant/src/components/AssistantLauncher.tsx`:

```tsx
import * as React from "react";
import { Button, FluentProvider, webLightTheme } from "@fluentui/react-components";
import type { AskClient } from "../api/KnowledgeApiClient";
import type { PageContextDto } from "../contract";
import { ChatPanel } from "./ChatPanel";

export interface AssistantLauncherProps {
  client: AskClient;
  getPage: () => PageContextDto;
}

const PANEL_ID = "kb-assistant-panel";

export function AssistantLauncher({ client, getPage }: AssistantLauncherProps): JSX.Element {
  const [open, setOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const close = (): void => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <FluentProvider theme={webLightTheme}>
      {open && <ChatPanel id={PANEL_ID} client={client} getPage={getPage} onClose={close} />}
      <Button
        ref={buttonRef}
        appearance="primary"
        shape="circular"
        size="large"
        aria-label="Abrir assistente"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        style={{ position: "fixed", right: 24, bottom: 24, zIndex: 1000 }}
        onClick={() => (open ? close() : setOpen(true))}
      >
        💬
      </Button>
    </FluentProvider>
  );
}
```

- [ ] **Step 4: Run tests**

Run (in `apps/spfx-assistant`): `npm run test:unit`
Expected: PASS (client + panel + launcher tests). If `Textarea`'s `ref` does not reach the inner `<textarea>` in this Fluent version (focus test fails), pass the ref through `textarea={{ ref: inputRef }}` instead and re-run.

- [ ] **Step 5: Wire the customizer**

Replace the body of `apps/spfx-assistant/src/extensions/assistant/AssistantApplicationCustomizer.ts` (keep the generated `Log`/strings imports only if still used; remove the generated sample alert):

```ts
import * as React from "react";
import * as ReactDOM from "react-dom";
import {
  BaseApplicationCustomizer,
  PlaceholderContent,
  PlaceholderName,
} from "@microsoft/sp-application-base";
import { AadHttpClient } from "@microsoft/sp-http";
import { KnowledgeApiClient, type HttpPoster } from "../../api/KnowledgeApiClient";
import { AssistantLauncher } from "../../components/AssistantLauncher";
import type { PageContextDto } from "../../contract";

export interface IAssistantApplicationCustomizerProperties {
  apiBaseUrl: string;
  apiResource: string;
}

export default class AssistantApplicationCustomizer extends BaseApplicationCustomizer<IAssistantApplicationCustomizerProperties> {
  private placeholder: PlaceholderContent | undefined;

  public onInit(): Promise<void> {
    this.context.placeholderProvider.changedEvent.add(this, this.render);
    this.render();
    return Promise.resolve();
  }

  public onDispose(): void {
    if (this.placeholder) ReactDOM.unmountComponentAtNode(this.placeholder.domElement);
  }

  private render(): void {
    if (!this.placeholder) {
      this.placeholder = this.context.placeholderProvider.tryCreateContent(PlaceholderName.Bottom, {
        onDispose: () => this.onDispose(),
      });
    }
    if (!this.placeholder) return;

    const client = new KnowledgeApiClient({
      baseUrl: this.properties.apiBaseUrl,
      getHttp: async (): Promise<HttpPoster> => {
        const aad = await this.context.aadHttpClientFactory.getClient(this.properties.apiResource);
        return { post: (url, init) => aad.post(url, AadHttpClient.configurations.v1, init) };
      },
    });

    ReactDOM.render(
      React.createElement(AssistantLauncher, { client, getPage: () => this.currentPage() }),
      this.placeholder.domElement,
    );
  }

  private currentPage(): PageContextDto {
    const list = this.context.pageContext.list;
    return {
      url: window.location.href,
      title: document.title,
      siteUrl: this.context.pageContext.web.absoluteUrl,
      ...(list ? { listTitle: list.title } : {}),
    };
  }
}
```

- [ ] **Step 6: Build and package**

Run (in `apps/spfx-assistant`):

```powershell
npm run elements
npm run build
```

Then run the generated production packaging script (Heft toolchain; the script name recorded in Task 7 Step 1, typically `npm run package-solution` or `heft package-solution --production`).
Expected: `sharepoint/solution/spfx-assistant.sppkg` exists. Unzip-inspect is not needed; confirm size > 0 and record the command in `docs/setup/phase-1.md`.

Run (repo root): `npm run check`
Expected: all green, including `test:spfx`.

- [ ] **Step 7: Commit**

```bash
git add apps/spfx-assistant
git commit -m "feat(spfx): add accessible assistant launcher and chat panel"
```

---

### Task 10: Install on the demo site, acceptance tests, docs

**Files:**

- Modify: `docs/setup/phase-1.md`, `README.md`
- Optional: `docs/images/phase-1-*.png` (anonymized by the user)

**Interfaces:**

- Consumes: `.sppkg` (Task 9), deployed API (Task 6).
- Produces: Phase 1 definition of done satisfied.

- [ ] **Step 1: User uploads the package (manual, partner admin account)**

Instruct the user: App Catalog site → **Apps for SharePoint** → upload `apps/spfx-assistant/sharepoint/solution/spfx-assistant.sppkg` → in the dialog **do not** tick "Make this solution available to all sites" → **Deploy**.

- [ ] **Step 2: User approves API access (manual)**

SharePoint Admin Center → **Advanced → API access** → pending request `kb-knowledge-api-dev` / `user_impersonation` → **Approve**. (Grants the "SharePoint Online Client Extensibility Web Application Principal" the delegated scope.)

- [ ] **Step 3: User adds the app to the demo site only (manual)**

`/sites/kb-demo` → **Site contents → New → App** → add the assistant app. Do not add it anywhere else.

- [ ] **Step 4: Acceptance tests (user runs, assistant verifies evidence)**

| Check                                                      | Expected                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| User A opens `kb-demo`, clicks the button, asks a question | Answer with A's display name, the page title and the "Resposta de teste" badge |
| User B (private window) does the same                      | Answer with B's display name                                                   |
| `curl` without token (Task 6 Step 2)                       | `401`                                                                          |
| `curl` with Graph token (Task 6 Step 3)                    | `401`                                                                          |
| A opens a partner department site                          | No assistant button                                                            |
| Keyboard only: Tab to button, Enter, type, Enter, Esc      | Panel opens, answers, closes; focus back on button                             |

If the browser console shows a CORS error, verify `sharepoint_origin` in tfvars exactly matches the page origin and re-plan/apply. If the panel shows "Assistente não configurado neste site.", the API access request was not approved or is still propagating (can take several minutes).

- [ ] **Step 5: Complete the runbook and README**

Fill every section of `docs/setup/phase-1.md` (Provision, Deploy the API, Build the SPFx package, Install on the demo site, Verify, Pitfalls) with the exact commands used and any problems hit, and mark all checklist rows ✅. In `README.md` update "Current phase" to Phase 1 and add `apps/knowledge-api`, `apps/spfx-assistant`, `packages/llm-providers` to the structure table.

- [ ] **Step 6: Final verification**

Run: `npm run check`
Expected: all green.

Run: `git grep -n -I -e "sharepoint.com" -e "azurewebsites.net" -- ":!docs/superpowers" ":!package-lock.json"`
Expected: only `contoso` / `xxxxxx` placeholders.

- [ ] **Step 7: Commit and push**

```bash
git add -A
git commit -m "docs: complete Phase 1 runbook and README"
git push origin main
```
