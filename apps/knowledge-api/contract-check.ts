// Type-level test: the SPFx wire contract must stay identical to the API domain types.
import type { AskResponse as ApiAskResponse, PageContext } from "@kb/core";
import type { AskRequest, AskResponse, PageContextDto } from "../spfx-assistant/src/contract.js";

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type PageContextMatches = Assert<Equal<PageContextDto, PageContext>>;
// The UI treats diagnostics as opaque; every other field must match exactly.
export type ResponseMatches = Assert<
  Equal<AskResponse, Omit<ApiAskResponse, "diagnostics"> & { diagnostics?: unknown }>
>;
export type RequestMatches = Assert<Equal<AskRequest, { question: string; page: PageContext }>>;
