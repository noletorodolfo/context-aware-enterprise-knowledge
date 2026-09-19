import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@kb/core": src("./packages/core/src/index.ts"),
      "@kb/governance": src("./packages/governance/src/index.ts"),
      "@kb/llm-providers": src("./packages/llm-providers/src/index.ts"),
      "@kb/retrievers": src("./packages/retrievers/src/index.ts"),
      "@kb/test-support/otel": src("./test-support/src/otel.ts"),
      "@kb/knowledge-api/ask": src("./apps/knowledge-api/src/ask/handle-ask.ts"),
      "@kb/sample-docs": src("./tools/sample-docs/src/parse.ts"),
    },
  },
  test: {
    include: [
      "packages/**/*.test.ts",
      "tools/**/*.test.ts",
      "apps/knowledge-api/**/*.test.ts",
      "eval/**/*.test.ts",
      "test-support/**/*.test.ts",
      "scripts/**/*.test.mjs",
    ],
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
