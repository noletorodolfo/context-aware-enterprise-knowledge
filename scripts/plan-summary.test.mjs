import { describe, expect, it } from "vitest";
import { summarizePlan } from "./plan-summary.mjs";

const SECRET = "SECRET-VALUE-123";

const change = (address, actions, extra = {}) => ({
  address,
  change: { actions, before: { name: SECRET }, after: { name: SECRET, tags: { owner: SECRET } } },
  ...extra,
});

describe("summarizePlan", () => {
  it("lists changed resources with their action and a counts line", () => {
    const markdown = summarizePlan({
      resource_changes: [
        change("azurerm_resource_group.dev", ["create"]),
        change("module.openai.azurerm_cognitive_account.this", ["update"]),
        change("azurerm_role_assignment.old", ["delete"]),
        change("module.function_app.azurerm_storage_account.host", ["delete", "create"]),
        change("azurerm_key_vault.this", ["create", "delete"]),
        change("azurerm_resource_group.unchanged", ["no-op"]),
        change("data.azurerm_client_config.current", ["read"]),
      ],
    });

    expect(markdown).toContain("**Plan:** 3 to add, 1 to change, 3 to destroy (2 replaced)");
    expect(markdown).toContain("| `azurerm_resource_group.dev` | create |");
    expect(markdown).toContain("| `module.openai.azurerm_cognitive_account.this` | update |");
    expect(markdown).toContain("| `azurerm_role_assignment.old` | destroy |");
    expect(markdown).toContain("| `module.function_app.azurerm_storage_account.host` | replace |");
    expect(markdown).toContain("| `azurerm_key_vault.this` | replace |");
    expect(markdown).not.toContain("unchanged");
    expect(markdown).not.toContain("client_config");
  });

  it("says so when nothing changes", () => {
    const markdown = summarizePlan({
      resource_changes: [change("azurerm_resource_group.dev", ["no-op"])],
    });
    expect(markdown).toContain("**Plan:** no changes.");
    expect(markdown).not.toContain("| Resource |");
  });

  it("never prints attribute values", () => {
    const markdown = summarizePlan({
      resource_changes: [change("azurerm_resource_group.dev", ["update"])],
      output_changes: { function_app_url: { actions: ["update"], before: SECRET, after: SECRET } },
    });
    expect(markdown).not.toContain(SECRET);
  });

  it("hides for_each keys, which can carry values, but keeps numeric indexes", () => {
    const markdown = summarizePlan({
      resource_changes: [
        change('azurerm_role_assignment.ci["someone@contoso.com"]', ["create"]),
        change("module.identity.azuread_service_principal_delegated_permission_grant.graph[0]", [
          "update",
        ]),
      ],
    });
    expect(markdown).toContain("`azurerm_role_assignment.ci[…]`");
    expect(markdown).not.toContain("contoso");
    expect(markdown).toContain(
      "`module.identity.azuread_service_principal_delegated_permission_grant.graph[0]`",
    );
  });

  it("lists changed outputs by name only", () => {
    const markdown = summarizePlan({
      resource_changes: [],
      output_changes: {
        obo_certificate: { actions: ["create"] },
        function_app_url: { actions: ["no-op"] },
      },
    });
    expect(markdown).toContain("Outputs changed: `obo_certificate`");
    expect(markdown).not.toContain("function_app_url");
  });
});
