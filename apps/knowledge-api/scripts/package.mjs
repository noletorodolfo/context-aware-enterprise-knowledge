// Bundles the API into a self-contained deploy/ folder. Workspace packages (@kb/*) are symlinks
// that `func azure functionapp publish` cannot follow, so everything is inlined into main.cjs.
//
// @kb/core and @kb/llm-providers resolve to their dist/ output, so on a fresh clone (or after
// cleaning dist/) this script builds the whole repo project graph first via `tsc -b` before
// esbuild bundles main.ts.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const repoRoot = new URL("../../../", import.meta.url);
const out = new URL("deploy/", root);

// Resolve the repo's local `typescript` and invoke its tsc.js with `node` directly (not the
// .cmd/.sh shim in node_modules/.bin) so this works cross-platform without a shell.
const require = createRequire(fileURLToPath(new URL("package.json", repoRoot)));
const tscJs = require.resolve("typescript/bin/tsc");
execFileSync(process.execPath, [tscJs, "-b"], { cwd: fileURLToPath(repoRoot), stdio: "inherit" });

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
  loader: { ".md": "text" },
  // ESM dependencies (e.g. @azure/monitor-opentelemetry) read import.meta.url, which is empty
  // in a CommonJS bundle: point it at the bundle file instead.
  banner: { js: 'const __importMetaUrl = require("node:url").pathToFileURL(__filename).href;' },
  define: { "import.meta.url": "__importMetaUrl" },
  external: ["@azure/functions-core"], // provided by the Functions Node.js worker
});

await copyFile(new URL("host.json", root), new URL("host.json", out));
await writeFile(
  new URL("package.json", out),
  JSON.stringify({ name: "knowledge-api", version: "0.1.0", main: "main.cjs" }, null, 2),
);
// Without any function.json files (Node.js v4 programming model), `func azure functionapp
// publish` cannot infer the project language from deploy/ alone. Write this so the CLI can
// detect it; the deployed app doesn't use it (all real settings are Terraform-managed).
await writeFile(
  new URL("local.settings.json", out),
  JSON.stringify({ IsEncrypted: false, Values: { FUNCTIONS_WORKER_RUNTIME: "node" } }, null, 2),
);
console.log("Packaged to", fileURLToPath(out));
