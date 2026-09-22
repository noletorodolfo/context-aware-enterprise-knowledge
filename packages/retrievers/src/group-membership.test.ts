import { describe, expect, it, vi } from "vitest";
import { isUpstreamError } from "@kb/core";
import { createGroupMembership } from "./group-membership.js";

const page = (value: unknown[], nextLink?: string) =>
  new Response(JSON.stringify({ value, ...(nextLink ? { "@odata.nextLink": nextLink } : {}) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("createGroupMembership", () => {
  it("asks Graph for ids only and returns the caller's group ids", async () => {
    const calls: string[] = [];
    const fetchFn = ((url: string) => {
      calls.push(url);
      return Promise.resolve(page([{ id: "group-a" }, { id: "group-b" }]));
    }) as unknown as typeof fetch;

    const groups = await createGroupMembership({ fetchFn })("user-token");

    expect(groups).toEqual(["group-a", "group-b"]);
    expect(calls[0]).toBe("https://graph.microsoft.com/v1.0/me/memberOf?$select=id&$top=999");
  });

  it("follows paging", async () => {
    const responses = [
      page([{ id: "group-a" }], "https://graph.microsoft.com/v1.0/me/memberOf?$skiptoken=x"),
      page([{ id: "group-b" }]),
    ];
    const fetchFn = (() => Promise.resolve(responses.shift())) as unknown as typeof fetch;

    await expect(createGroupMembership({ fetchFn })("user-token")).resolves.toEqual([
      "group-a",
      "group-b",
    ]);
  });

  it("ignores entries without an id, such as directory roles without one", async () => {
    const fetchFn = (() =>
      Promise.resolve(
        page([{ id: "group-a" }, { displayName: "no id" }]),
      )) as unknown as typeof fetch;
    await expect(createGroupMembership({ fetchFn })("user-token")).resolves.toEqual(["group-a"]);
  });

  it("caches per caller until the entry expires", async () => {
    const fetchFn = vi.fn(() =>
      Promise.resolve(page([{ id: "group-a" }])),
    ) as unknown as typeof fetch;
    let now = 1_000;
    const resolve = createGroupMembership({ fetchFn, now: () => now, ttlMs: 60_000 });

    await resolve("token-1");
    await resolve("token-1");
    await resolve("token-2");
    expect(fetchFn).toHaveBeenCalledTimes(2);

    now += 60_001;
    await resolve("token-1");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("fails as an upstream error instead of returning no groups", async () => {
    const fetchFn = (() =>
      Promise.resolve(new Response("{}", { status: 503 }))) as unknown as typeof fetch;
    await expect(createGroupMembership({ fetchFn })("user-token")).rejects.toSatisfy(
      (error: unknown) => isUpstreamError(error) && error.kind === "upstream",
    );
  });
});
