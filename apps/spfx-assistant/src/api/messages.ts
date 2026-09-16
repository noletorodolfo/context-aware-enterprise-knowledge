export type AskErrorKind =
  "unauthorized" | "invalid-request" | "server-error" | "unavailable" | "not-configured";

export const MAX_QUESTION_LENGTH = 1000;

/** User-facing messages (pt-BR: the assistant's users are Brazilian). */
export const errorMessages: Record<AskErrorKind, string> = {
  unauthorized: "Não foi possível autenticar. Recarregue a página.",
  "invalid-request": "Escreva uma pergunta de até 1.000 caracteres.",
  "server-error": "O assistente teve um problema. Tente de novo.",
  unavailable: "Assistente indisponível no momento.",
  "not-configured": "Assistente não configurado neste site.",
};
