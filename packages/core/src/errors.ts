export type UpstreamErrorKind =
  | "consent-required"
  | "upstream"
  | "llm-unavailable"
  | "llm-invalid-output"
  | "llm-content-filtered";

/** Content-free diagnostic fields (no message/body/prompt text) attached to an UpstreamError. */
export type UpstreamErrorDetail = Record<string, string | number | boolean>;

/** Failure of a dependency (Entra ID, Key Vault, Graph, Azure OpenAI) with a stable kind. */
export class UpstreamError extends Error {
  public readonly kind: UpstreamErrorKind;
  public readonly detail: UpstreamErrorDetail | undefined;

  public constructor(kind: UpstreamErrorKind, message: string, detail?: UpstreamErrorDetail) {
    super(message);
    this.name = "UpstreamError";
    this.kind = kind;
    this.detail = detail;
  }
}

export function isUpstreamError(error: unknown): error is UpstreamError {
  return error instanceof Error && error.name === "UpstreamError" && "kind" in error;
}
