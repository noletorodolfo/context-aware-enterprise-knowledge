import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      // react@17's package.json has no "exports" map, so Node's native ESM resolver (used for
      // @griffel/react, which ships an unbuilt ESM "src" entry with `import "react/jsx-runtime"`)
      // cannot resolve the extensionless subpath. Point it at the concrete file.
      { find: /^react\/jsx-runtime$/, replacement: "react/jsx-runtime.js" },
      { find: /^react\/jsx-dev-runtime$/, replacement: "react/jsx-dev-runtime.js" },
    ],
  },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "jsdom",
    server: {
      // Force Vite (not Node's native ESM resolver) to load these packages, so the
      // `resolve.alias` above applies to their `react/jsx-runtime` import.
      deps: {
        inline: [/@griffel\//, /@fluentui\//],
      },
    },
  },
});
