import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AskClient, AskResult } from "../src/api/KnowledgeApiClient";
import { ChatPanel } from "../src/components/ChatPanel";
import { AssistantLauncher } from "../src/components/AssistantLauncher";

const page = {
  url: "https://contoso.sharepoint.com/sites/kb-demo",
  title: "Home",
  siteUrl: "https://contoso.sharepoint.com/sites/kb-demo",
};
const mockAnswer: AskResult = {
  ok: true,
  answer: {
    text: "Olá, A! Esta é uma resposta de teste.",
    citations: [],
    refused: false,
    promptVersion: "mock",
  },
};

function fakeClient(...results: AskResult[]): AskClient & { ask: ReturnType<typeof vi.fn> } {
  const ask = vi.fn();
  for (const r of results) ask.mockResolvedValueOnce(r);
  return { ask };
}

function renderPanel(client: AskClient, onClose = vi.fn()) {
  render(<ChatPanel id="kb-panel" client={client} getPage={() => page} onClose={onClose} />);
  return { onClose, input: screen.getByLabelText("Sua pergunta") as HTMLTextAreaElement };
}

function ask(input: HTMLTextAreaElement, text: string) {
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
}

afterEach(cleanup);

describe("ChatPanel", () => {
  it("moves focus to the question input when opened", () => {
    const { input } = renderPanel(fakeClient());
    expect(document.activeElement).toBe(input);
  });

  it("closes on Escape", () => {
    const { onClose } = renderPanel(fakeClient());
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sends the trimmed question with page context and announces the answer with a test badge", async () => {
    const client = fakeClient(mockAnswer);
    const { input } = renderPanel(client);
    ask(input, "  Qual o auxílio?  ");

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Esta é uma resposta de teste."),
    );
    expect(client.ask).toHaveBeenCalledWith({ question: "Qual o auxílio?", page });
    expect(screen.getByText("Resposta de teste")).toBeTruthy();
  });

  it("shows the mapped error and retries the same question", async () => {
    const client = fakeClient({ ok: false, error: "unavailable" }, mockAnswer);
    const { input } = renderPanel(client);
    ask(input, "Qual o auxílio?");

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Assistente indisponível no momento.",
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("Esta é uma resposta de teste."),
    );
    expect(client.ask).toHaveBeenCalledTimes(2);
    expect(client.ask.mock.calls[1]?.[0]).toEqual({ question: "Qual o auxílio?", page });
  });

  it("shows a server error and re-enables Enviar when getPage throws", async () => {
    const client = fakeClient();
    const onClose = vi.fn();
    render(
      <ChatPanel
        id="kb-panel"
        client={client}
        getPage={() => {
          throw new Error("boom");
        }}
        onClose={onClose}
      />,
    );
    const input = screen.getByLabelText("Sua pergunta") as HTMLTextAreaElement;
    ask(input, "Qual o auxílio?");

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "O assistente teve um problema. Tente de novo.",
      ),
    );
    expect(client.ask).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("button", { name: "Enviar" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("rejects questions over 1000 characters without calling the API", async () => {
    const client = fakeClient();
    const { input } = renderPanel(client);
    ask(input, "x".repeat(1001));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Escreva uma pergunta de até 1.000 caracteres.",
      ),
    );
    expect(client.ask).not.toHaveBeenCalled();
  });

  it("ignores empty questions", () => {
    const client = fakeClient();
    const { input } = renderPanel(client);
    ask(input, "   ");
    expect(client.ask).not.toHaveBeenCalled();
  });
});

describe("AssistantLauncher", () => {
  it("opens the panel and returns focus to the button when closed with Escape", () => {
    render(<AssistantLauncher client={fakeClient()} getPage={() => page} />);
    const button = screen.getByRole("button", { name: "Abrir assistente" });
    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("renders no visible text inside the launcher button, only an icon", () => {
    render(<AssistantLauncher client={fakeClient()} getPage={() => page} />);
    const button = screen.getByRole("button", { name: "Abrir assistente" });

    expect(button.textContent).toBe("");
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("uses brandColor as the button background when provided", () => {
    render(
      <AssistantLauncher client={fakeClient()} getPage={() => page} brandColor="#123456" />,
    );
    const button = screen.getByRole("button", { name: "Abrir assistente" });

    expect(button.style.background).toContain("rgb(18, 52, 86)");
  });

  it("swaps the icon when the panel opens and closes", () => {
    render(<AssistantLauncher client={fakeClient()} getPage={() => page} />);
    const button = screen.getByRole("button", { name: "Abrir assistente" });
    const closedIcon = button.innerHTML;

    fireEvent.click(button);
    const openIcon = button.innerHTML;
    expect(openIcon).not.toBe(closedIcon);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(button.innerHTML).toBe(closedIcon);
  });
});
