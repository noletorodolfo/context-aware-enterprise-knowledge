import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { installTestTelemetry, type TestTelemetry } from "../../../../test-support/otel.js";
import { createClientAssertion } from "./client-assertion.js";
import { GRAPH_DELEGATED_SCOPES, createOboExchanger } from "./obo.js";

const tokenResponse = () =>
  Promise.resolve(
    new Response(JSON.stringify({ access_token: "graph-token", expires_in: 3600 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

describe("auth telemetry", () => {
  let telemetry: TestTelemetry;
  beforeAll(() => {
    telemetry = installTestTelemetry();
  });
  beforeEach(() => telemetry.reset());

  it("creates obo.exchange around the assertion signing, and flags cache hits", async () => {
    const exchange = createOboExchanger({
      tenantId: "tenant-1",
      clientId: "client-1",
      scopes: GRAPH_DELEGATED_SCOPES,
      createAssertion: () =>
        createClientAssertion({
          tenantId: "tenant-1",
          clientId: "client-1",
          certificateThumbprintSha1Hex: "A1B2C3D4E5F60718293A4B5C6D7E8F9012345678",
          signer: { signRs256: () => Promise.resolve(new Uint8Array([1, 2, 3])) },
        }),
      fetchFn: tokenResponse as unknown as typeof fetch,
    });

    await exchange("user-token", "oid-a");
    await exchange("user-token", "oid-a");

    const oboSpans = telemetry.spans().filter((span) => span.name === "obo.exchange");
    expect(oboSpans.map((span) => span.attributes["kb.obo.cache_hit"])).toEqual([false, true]);
    const sign = telemetry.span("keyvault.sign");
    expect(sign.parentSpanContext?.spanId).toBe(oboSpans[0]?.spanContext().spanId);
    const values = telemetry.spans().flatMap((span) => Object.values(span.attributes).map(String));
    expect(values.some((value) => value.includes("token"))).toBe(false);
  });

  it("marks obo.exchange as failed with the upstream kind", async () => {
    const exchange = createOboExchanger({
      tenantId: "tenant-1",
      clientId: "client-1",
      scopes: GRAPH_DELEGATED_SCOPES,
      createAssertion: () => Promise.resolve("assertion"),
      fetchFn: (() =>
        Promise.resolve(new Response("{}", { status: 500 }))) as unknown as typeof fetch,
    });
    await expect(exchange("user-token", "oid-a")).rejects.toThrow();
    const span = telemetry.span("obo.exchange");
    expect(span.status.code).toBe(2);
    expect(span.attributes["error.type"]).toBe("upstream");
  });
});
