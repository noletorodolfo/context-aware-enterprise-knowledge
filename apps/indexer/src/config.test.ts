import { describe, expect, it } from "vitest";
import { parseLibraryAcl } from "./config.js";

describe("parseLibraryAcl", () => {
  it("reads a library to groups map", () => {
    expect(parseLibraryAcl('{"Políticas":["g1"],"RH-Restrito":["g2","g3"]}')).toEqual({
      Políticas: ["g1"],
      "RH-Restrito": ["g2", "g3"],
    });
  });

  it("rejects invalid JSON rather than starting with no permissions", () => {
    expect(() => parseLibraryAcl("{oops")).toThrow(/valid JSON/);
  });

  it.each(['{"TI":[]}', '{"TI":["  "]}', '{"TI":"g1"}'])("rejects %s", (raw) => {
    expect(() => parseLibraryAcl(raw)).toThrow(/TI/);
  });

  it("rejects a configuration with no library", () => {
    expect(() => parseLibraryAcl("{}")).toThrow(/no library/);
  });

  it("rejects a list where an object is required", () => {
    expect(() => parseLibraryAcl('["Políticas"]')).toThrow(/object/);
  });
});
