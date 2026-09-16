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
