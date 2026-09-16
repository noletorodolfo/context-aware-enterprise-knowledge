import * as React from "react";
import * as ReactDOM from "react-dom";
import {
  BaseApplicationCustomizer,
  PlaceholderContent,
  PlaceholderName,
} from "@microsoft/sp-application-base";
import { AadHttpClient } from "@microsoft/sp-http";
import { ThemeProvider } from "@microsoft/sp-component-base";
import { KnowledgeApiClient, type HttpPoster } from "../../api/KnowledgeApiClient";
import { AssistantLauncher } from "../../components/AssistantLauncher";
import type { PageContextDto } from "../../contract";

export interface IAssistantApplicationCustomizerProperties {
  apiBaseUrl: string;
  apiResource: string;
}

export default class AssistantApplicationCustomizer extends BaseApplicationCustomizer<IAssistantApplicationCustomizerProperties> {
  private placeholder: PlaceholderContent | undefined;

  public onInit(): Promise<void> {
    this.context.placeholderProvider.changedEvent.add(this, this.render);
    this.render();
    return Promise.resolve();
  }

  public onDispose(): void {
    if (this.placeholder) ReactDOM.unmountComponentAtNode(this.placeholder.domElement);
  }

  private render(): void {
    if (!this.placeholder) {
      this.placeholder = this.context.placeholderProvider.tryCreateContent(PlaceholderName.Bottom, {
        onDispose: () => this.onDispose(),
      });
    }
    if (!this.placeholder) return;

    const client = new KnowledgeApiClient({
      baseUrl: this.properties.apiBaseUrl,
      getHttp: async (): Promise<HttpPoster> => {
        const aad = await this.context.aadHttpClientFactory.getClient(this.properties.apiResource);
        return { post: (url, init) => aad.post(url, AadHttpClient.configurations.v1, init) };
      },
    });

    ReactDOM.render(
      React.createElement(AssistantLauncher, {
        client,
        getPage: () => this.currentPage(),
        brandColor: this.themePrimaryColor(),
      }),
      this.placeholder.domElement,
    );
  }

  private themePrimaryColor(): string | undefined {
    const serviceScope = this.context.serviceScope;
    if (!serviceScope || !serviceScope.consume) return undefined;

    const themeProvider = serviceScope.consume(ThemeProvider.serviceKey);
    return themeProvider?.tryGetTheme?.()?.palette?.themePrimary;
  }

  private currentPage(): PageContextDto {
    const list = this.context.pageContext.list;
    return {
      url: window.location.href,
      title: document.title,
      siteUrl: this.context.pageContext.web.absoluteUrl,
      ...(list ? { listTitle: list.title } : {}),
    };
  }
}
