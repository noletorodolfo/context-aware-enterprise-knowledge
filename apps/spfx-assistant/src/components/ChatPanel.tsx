import * as React from "react";
import { Badge, Button, Spinner, Textarea } from "@fluentui/react-components";
import type { AskClient } from "../api/KnowledgeApiClient";
import { errorMessages, MAX_QUESTION_LENGTH } from "../api/messages";
import type { CitationDto, PageContextDto } from "../contract";

export interface ChatPanelProps {
  id: string;
  client: AskClient;
  getPage: () => PageContextDto;
  onClose: () => void;
}

type Message =
  | { kind: "question"; text: string }
  | {
      kind: "answer";
      text: string;
      isMock: boolean;
      refused: boolean;
      piiMasked: boolean;
      citations: CitationDto[];
    }
  | { kind: "error"; text: string; retryQuestion?: string };

const TRACE_LABEL = "Código de rastreamento";
const PII_NOTICE = "Removemos dados pessoais da sua pergunta.";

const panelStyle: React.CSSProperties = {
  position: "fixed",
  right: 24,
  bottom: 88,
  width: "min(380px, calc(100vw - 48px))",
  maxHeight: "min(560px, calc(100vh - 120px))",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 16,
  background: "#fff",
  borderRadius: 8,
  boxShadow: "0 8px 24px rgba(0,0,0,.2)",
  zIndex: 1000,
};

export function ChatPanel({ id, client, getPage, onClose }: ChatPanelProps): React.ReactElement {
  const [draft, setDraft] = React.useState("");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [sending, setSending] = React.useState(false);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = async (question: string): Promise<void> => {
    setSending(true);
    try {
      const result = await client.ask({ question, page: getPage() });
      setMessages((current) => [
        ...current,
        result.ok
          ? {
              kind: "answer",
              text: result.answer.text,
              isMock: result.answer.promptVersion === "mock",
              refused: result.answer.refused,
              piiMasked: result.answer.piiMasked,
              citations: result.answer.citations,
            }
          : {
              kind: "error",
              text: `${errorMessages[result.error]}
${TRACE_LABEL}: ${result.traceId}`,
              retryQuestion: question,
            },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        { kind: "error", text: errorMessages["server-error"], retryQuestion: question },
      ]);
    } finally {
      setSending(false);
    }
  };

  const submit = (): void => {
    const question = draft.trim();
    if (question === "" || sending) return;
    if (question.length > MAX_QUESTION_LENGTH) {
      setMessages((current) => [
        ...current,
        { kind: "error", text: errorMessages["invalid-request"] },
      ]);
      return;
    }
    setDraft("");
    setMessages((current) => [...current, { kind: "question", text: question }]);
    send(question).catch(() => {
      /* send() resolves the error into a message; nothing to do on rejection */
    });
  };

  const last = messages[messages.length - 1];
  const announcement = last && last.kind !== "question" ? last.text : "";

  return (
    <div
      id={id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={`${id}-title`}
      style={panelStyle}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 id={`${id}-title`} style={{ margin: 0, fontSize: 16 }}>
          Assistente de conhecimento
        </h2>
        <Button appearance="subtle" aria-label="Fechar assistente" onClick={onClose}>
          ✕
        </Button>
      </div>

      <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.map((message, index) => (
          <div
            key={index}
            style={{ alignSelf: message.kind === "question" ? "flex-end" : "flex-start" }}
          >
            {message.kind === "answer" && message.isMock && (
              <Badge appearance="outline">Resposta de teste</Badge>
            )}
            {message.kind === "answer" && message.piiMasked && (
              <p role="note" style={{ margin: "4px 0", fontSize: 12, color: "#605e5c" }}>
                {PII_NOTICE}
              </p>
            )}
            {message.kind === "answer" && message.refused && (
              <Badge appearance="tint" color="warning">
                Sem resposta nos documentos
              </Badge>
            )}
            <p style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>{message.text}</p>
            {message.kind === "answer" && message.citations.length > 0 && (
              <ol aria-label="Fontes" style={{ margin: "4px 0", paddingLeft: 20 }}>
                {message.citations.map((citation, citationIndex) => (
                  <li key={citationIndex} style={{ marginBottom: 4 }}>
                    <a href={citation.url} target="_blank" rel="noreferrer">
                      {citation.title}
                    </a>
                    <blockquote style={{ margin: "2px 0 0", fontStyle: "italic" }}>
                      “{citation.quote}”
                    </blockquote>
                  </li>
                ))}
              </ol>
            )}
            {message.kind === "error" && message.retryQuestion !== undefined && (
              <Button
                size="small"
                disabled={sending}
                onClick={() => {
                  if (message.retryQuestion !== undefined) {
                    send(message.retryQuestion).catch(() => {
                      /* send() resolves the error into a message; nothing to do on rejection */
                    });
                  }
                }}
              >
                Tentar de novo
              </Button>
            )}
          </div>
        ))}
        {sending && <Spinner size="tiny" label="Consultando…" />}
      </div>

      <div
        role="status"
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
        }}
      >
        {announcement}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        style={{ display: "flex", gap: 8 }}
      >
        <Textarea
          textarea={{ ref: inputRef }}
          aria-label="Sua pergunta"
          value={draft}
          resize="vertical"
          style={{ flex: 1 }}
          onChange={(_event, data) => setDraft(data.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button type="submit" appearance="primary" disabled={sending}>
          Enviar
        </Button>
      </form>
    </div>
  );
}
