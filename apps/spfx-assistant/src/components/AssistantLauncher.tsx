import * as React from "react";
import { Button, FluentProvider, webLightTheme } from "@fluentui/react-components";
import type { AskClient } from "../api/KnowledgeApiClient";
import type { PageContextDto } from "../contract";
import { ChatPanel } from "./ChatPanel";

export interface AssistantLauncherProps {
  client: AskClient;
  getPage: () => PageContextDto;
}

const PANEL_ID = "kb-assistant-panel";

export function AssistantLauncher({ client, getPage }: AssistantLauncherProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const close = (): void => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <FluentProvider theme={webLightTheme}>
      {open && <ChatPanel id={PANEL_ID} client={client} getPage={getPage} onClose={close} />}
      <Button
        ref={buttonRef}
        appearance="primary"
        shape="circular"
        size="large"
        aria-label="Abrir assistente"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        style={{ position: "fixed", right: 24, bottom: 24, zIndex: 1000 }}
        onClick={() => (open ? close() : setOpen(true))}
      >
        💬
      </Button>
    </FluentProvider>
  );
}
