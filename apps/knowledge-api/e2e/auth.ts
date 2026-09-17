import { readFile, writeFile } from "node:fs/promises";
import { PublicClientApplication, type ICachePlugin } from "@azure/msal-node";
import open from "open";
import type { E2eConfig } from "./e2e-config.js";

function fileCache(path: URL): ICachePlugin {
  return {
    beforeCacheAccess: async (context) => {
      try {
        context.tokenCache.deserialize(await readFile(path, "utf8"));
      } catch {
        /* first run: no cache yet */
      }
    },
    afterCacheAccess: async (context) => {
      if (context.cacheHasChanged) {
        await writeFile(path, context.tokenCache.serialize(), { mode: 0o600 });
      }
    },
  };
}

/** Access token for the API scope as the given user: silent from cache, else interactive browser sign-in. */
export async function signIn(
  config: E2eConfig,
  loginHint: string,
  cacheName: "a" | "b",
): Promise<string> {
  const pca = new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
    },
    cache: { cachePlugin: fileCache(new URL(`./.token-cache-${cacheName}.json`, import.meta.url)) },
  });

  const account = (await pca.getTokenCache().getAllAccounts()).find(
    (a) => a.username.toLowerCase() === loginHint.toLowerCase(),
  );
  if (account) {
    try {
      return (await pca.acquireTokenSilent({ account, scopes: [config.apiScope] })).accessToken;
    } catch {
      /* fall through to interactive */
    }
  }

  const result = await pca.acquireTokenInteractive({
    scopes: [config.apiScope],
    loginHint,
    prompt: "login",
    openBrowser: async (url) => {
      await open(url);
    },
    successTemplate: "<h1>Login concluído. Pode fechar esta aba.</h1>",
  });
  return result.accessToken;
}
