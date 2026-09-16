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
