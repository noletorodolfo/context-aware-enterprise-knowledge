import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("reads tenant and client id", () => {
    expect(loadConfig({ TENANT_ID: "tenant-1", API_CLIENT_ID: "client-1" })).toEqual({
      tenantId: "tenant-1",
      apiClientId: "client-1",
    });
  });

  it.each(["TENANT_ID", "API_CLIENT_ID"])("throws when %s is missing or blank", (name) => {
    const env: Record<string, string | undefined> = { TENANT_ID: "t", API_CLIENT_ID: "c" };
    env[name] = " ";
    expect(() => loadConfig(env)).toThrow(`Missing required setting: ${name}`);
  });
});
