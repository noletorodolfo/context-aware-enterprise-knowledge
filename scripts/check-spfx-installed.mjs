// apps/spfx-assistant is a standalone SPFx project with its own package.json/lockfile; its
// dependencies are not installed by the root workspaces `npm install`. Fail fast with a clear
// message instead of letting `npm run test:spfx` crash with a confusing "module not found".
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const nodeModules = fileURLToPath(new URL("../apps/spfx-assistant/node_modules", import.meta.url));

if (!existsSync(nodeModules)) {
  console.error(
    "apps/spfx-assistant/node_modules is missing.\n" +
      "apps/spfx-assistant is a standalone SPFx project; install its dependencies first:\n\n" +
      "  npm --prefix apps/spfx-assistant install\n",
  );
  process.exit(1);
}
