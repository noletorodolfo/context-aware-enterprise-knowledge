import { describe, expect, it } from "vitest";
import { assertDistinctLibraryNames, findByLibraryName, libraryKey } from "./library-name.js";

describe("libraryKey", () => {
  it("ignores accents and case, so a configuration may be plain ASCII", () => {
    expect(libraryKey("Políticas")).toBe(libraryKey("Politicas"));
    expect(libraryKey("RH-Restrito")).toBe(libraryKey("rh-restrito"));
  });

  it("keeps distinct names distinct", () => {
    expect(libraryKey("Políticas")).not.toBe(libraryKey("Politica"));
    expect(libraryKey("TI")).not.toBe(libraryKey("RH"));
  });

  it("does not rescue a name mangled by a wrong encoding", () => {
    // "Políticas" read as a single-byte encoding. It must not silently match: the configuration is
    // broken and failing closed is the only safe outcome.
    expect(libraryKey("PolÃ­ticas")).not.toBe(libraryKey("Políticas"));
  });
});

describe("findByLibraryName", () => {
  const acl = { Politicas: ["g1"], "RH-Restrito": ["g2"] };

  it("finds the entry whatever the accents", () => {
    expect(findByLibraryName(acl, "Políticas")).toEqual({ key: "Politicas", value: ["g1"] });
  });

  it("returns nothing for a library it does not know", () => {
    expect(findByLibraryName(acl, "Financeiro")).toBeUndefined();
  });
});

describe("assertDistinctLibraryNames", () => {
  it("accepts names that differ by more than accents", () => {
    expect(() => assertDistinctLibraryNames(["Politicas", "TI", "RH-Restrito"])).not.toThrow();
  });

  it("refuses two names that collapse to the same key", () => {
    expect(() => assertDistinctLibraryNames(["Políticas", "Politicas"])).toThrow(/same name/);
  });
});
