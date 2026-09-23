import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_CHANGED_SPEC_VERSION,
  DOCUMENT_CHANGED_TYPE,
  parseDocumentChanged,
} from "./event.js";

const valid = {
  specVersion: "1.0",
  type: "kb.document.changed",
  id: "sub-1:2026-09-23T12:00:00Z",
  time: "2026-09-23T12:00:00.000Z",
  siteId: "site-1",
  driveId: "drive-1",
  library: "Políticas",
};

describe("parseDocumentChanged", () => {
  it("accepts a complete v1 event", () => {
    expect(parseDocumentChanged(valid)).toEqual(valid);
  });

  it("rejects a future contract version instead of guessing its meaning", () => {
    expect(() => parseDocumentChanged({ ...valid, specVersion: "2.0" })).toThrow(/specVersion/);
  });

  it("rejects an unknown event type", () => {
    expect(() => parseDocumentChanged({ ...valid, type: "kb.document.deleted" })).toThrow(/type/);
  });

  it.each(["id", "time", "siteId", "driveId", "library"])("requires %s", (field) => {
    expect(() => parseDocumentChanged({ ...valid, [field]: "" })).toThrow(new RegExp(field));
  });

  it("rejects a time that is not a date-time", () => {
    expect(() => parseDocumentChanged({ ...valid, time: "yesterday" })).toThrow(/date-time/);
  });

  it("rejects a non-object payload", () => {
    expect(() => parseDocumentChanged("kb.document.changed")).toThrow(/object/);
  });
});

/**
 * The published schema is the contract other services would read; the parser is what this service
 * enforces. Nothing stops the two from drifting except this test.
 */
describe("the published schema and the parser agree", () => {
  const schema = JSON.parse(
    readFileSync(
      new URL("../../../contracts/events/document-changed.v1.json", import.meta.url),
      "utf8",
    ),
  ) as {
    required: string[];
    properties: Record<string, { const?: string }>;
  };

  it("declares the version and type the parser accepts", () => {
    expect(schema.properties.specVersion?.const).toBe(DOCUMENT_CHANGED_SPEC_VERSION);
    expect(schema.properties.type?.const).toBe(DOCUMENT_CHANGED_TYPE);
  });

  it("requires exactly the fields the parser requires", () => {
    expect([...schema.required].sort()).toEqual(
      ["specVersion", "type", "id", "time", "siteId", "driveId", "library"].sort(),
    );
  });

  it("accepts an event that satisfies the schema", () => {
    expect(() => parseDocumentChanged(valid)).not.toThrow();
  });
});
