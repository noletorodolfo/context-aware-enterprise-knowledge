export type UpstreamErrorKind =
  "consent-required" | "upstream" | "llm-unavailable" | "llm-invalid-output";

/** Failure of a dependency (Entra ID, Key Vault, Graph, Azure OpenAI) with a stable kind. */
export class UpstreamError extends Error {
  public readonly kind: UpstreamErrorKind;

  public constructor(kind: UpstreamErrorKind, message: string) {
    super(message);
    this.name = "UpstreamError";
    this.kind = kind;
  }
}

export function isUpstreamError(error: unknown): error is UpstreamError {
  return error instanceof Error && error.name === "UpstreamError" && "kind" in error;
}
