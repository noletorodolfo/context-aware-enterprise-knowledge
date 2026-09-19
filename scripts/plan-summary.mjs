// Summarizes `terraform show -json <plan>` as Markdown for public CI logs and pull request comments.
// Only resource addresses and actions are printed: attribute values can identify the partner tenant
// (Phase 4 D3), so `before`/`after` are never read, and string keys in addresses are hidden.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

/** @param {string[]} actions */
function classify(actions) {
  const key = actions.join(",");
  if (key === "create") return "create";
  if (key === "update") return "update";
  if (key === "delete") return "destroy";
  if (key === "delete,create" || key === "create,delete") return "replace";
  return null; // no-op, read
}

/** for_each keys can be values (emails, names); numeric count indexes are safe. */
const redactAddress = (address) => address.replace(/\["[^"\]]*"\]/g, "[…]");

/**
 * @param {{ resource_changes?: { address: string, change: { actions: string[] } }[],
 *           output_changes?: Record<string, { actions: string[] }> }} plan
 * @returns {string} Markdown
 */
export function summarizePlan(plan) {
  const rows = (plan.resource_changes ?? [])
    .map((rc) => ({ address: redactAddress(rc.address), action: classify(rc.change.actions) }))
    .filter((row) => row.action !== null);
  const count = (action) => rows.filter((row) => row.action === action).length;
  const replaced = count("replace");
  const outputs = Object.entries(plan.output_changes ?? {})
    .filter(([, change]) => classify(change.actions) !== null)
    .map(([name]) => `\`${name}\``);

  const lines = [];
  if (rows.length === 0) {
    lines.push("**Plan:** no changes.");
  } else {
    const add = count("create") + replaced;
    const destroy = count("destroy") + replaced;
    lines.push(
      `**Plan:** ${add} to add, ${count("update")} to change, ${destroy} to destroy` +
        (replaced > 0 ? ` (${replaced} replaced)` : ""),
      "",
      "| Resource | Action |",
      "| --- | --- |",
      ...rows.map((row) => `| \`${row.address}\` | ${row.action} |`),
    );
  }
  if (outputs.length > 0) lines.push("", `Outputs changed: ${outputs.join(", ")}`);
  lines.push("", "_Attribute values are not shown; this repository is public._");
  return lines.join("\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: node scripts/plan-summary.mjs <plan.json>");
    process.exit(2);
  }
  console.log(summarizePlan(JSON.parse(await readFile(path, "utf8"))));
}
