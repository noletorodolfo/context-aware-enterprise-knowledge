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
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "tools/**/*.test.ts", "apps/knowledge-api/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**"],
  },
});
