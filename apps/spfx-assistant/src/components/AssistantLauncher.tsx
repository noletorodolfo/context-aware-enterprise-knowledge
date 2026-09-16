import * as React from "react";
import { Button, FluentProvider, Tooltip, tokens, webLightTheme } from "@fluentui/react-components";
import { ChatSparkleFilled, DismissFilled } from "@fluentui/react-icons";
import type { AskClient } from "../api/KnowledgeApiClient";
import type { PageContextDto } from "../contract";
import { ChatPanel } from "./ChatPanel";

export interface AssistantLauncherProps {
  client: AskClient;
  getPage: () => PageContextDto;
  brandColor?: string;
}

const PANEL_ID = "kb-assistant-panel";

export function AssistantLauncher({
  client,
  getPage,
  brandColor,
}: AssistantLauncherProps): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const close = (): void => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const background = brandColor ?? tokens.colorBrandBackground;

  return (
    <FluentProvider theme={webLightTheme}>
      {open && <ChatPanel id={PANEL_ID} client={client} getPage={getPage} onClose={close} />}
      <Tooltip content="Assistente de conhecimento" relationship="description">
        <Button
          ref={buttonRef}
          appearance="primary"
          shape="circular"
          aria-label="Abrir assistente"
          aria-expanded={open}
          aria-controls={PANEL_ID}
          icon={
            open
              ? <DismissFilled fontSize={28} />
              : <ChatSparkleFilled fontSize={28} />
          }
          style={{
            position: "fixed",
            right: 24,
            bottom: 24,
            zIndex: 1000,
            width: 56,
            height: 56,
            minWidth: 56,
            padding: 0,
            background,
            color: tokens.colorNeutralForegroundOnBrand,
            boxShadow: tokens.shadow16,
          }}
          className="kb-assistant-launcher-button"
          onClick={() => (open ? close() : setOpen(true))}
        />
      </Tooltip>
      <style>{`
        .kb-assistant-launcher-button:hover {
          filter: brightness(0.92);
        }
      `}</style>
    </FluentProvider>
  );
}
