import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@kb/core": src("./packages/core/src/index.ts"),
      "@kb/test-support/auth": src("./test-support/src/auth.ts"),
      "@kb/test-support/e2e-config": src("./test-support/src/e2e-config.ts"),
    },
  },
  test: {
    include: ["apps/knowledge-api/e2e/**/*.e2e.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
});
