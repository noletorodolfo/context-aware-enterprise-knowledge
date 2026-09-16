// Type-level test: the SPFx wire contract must stay identical to the API domain types.
import type { Answer, PageContext } from "@kb/core";
import type { AskRequest, AskResponse, PageContextDto } from "../spfx-assistant/src/contract.js";

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type PageContextMatches = Assert<Equal<PageContextDto, PageContext>>;
export type ResponseMatches = Assert<Equal<AskResponse, Answer>>;
export type RequestMatches = Assert<Equal<AskRequest, { question: string; page: PageContext }>>;
