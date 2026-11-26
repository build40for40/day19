// The Worker. OAuthProvider makes us an OAuth server for Claude and ChatGPT:
// /mcp needs a token, /authorize and /callback are our sign-in pages (auth.ts),
// and the library serves discovery, registration and /oauth/token itself.

import { OAuthError, OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { createMcpHandler } from "agents/mcp/server";
import { env } from "cloudflare:workers";
import { authHandler } from "./auth";
import { GoogleRevokedError, refreshAccessToken, type GoogleProps } from "./google";
import { createServer } from "./mcp";

export { Brain } from "./brain";

const mcpHandler = createMcpHandler(createServer);

export default new OAuthProvider<Env>({
  apiRoute: "/mcp",
  apiHandler: {
    fetch(request: Request, env: Env, ctx: ExecutionContext) {
      return mcpHandler(request, env, ctx);
    },
  },
  defaultHandler: authHandler as ExportedHandler<Env>,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  scopesSupported: ["contacts"],
  resourceMetadata: { resource: env.MCP_RESOURCE },

  // Keeps the Google token inside the grant fresh. Our access token lives exactly as long
  // as Google's, and each time Claude refreshes ours, we refresh Google's.
  tokenExchangeCallback: async ({ grantType, props }) => {
    const google = props as GoogleProps;
    if (grantType === "authorization_code") {
      return { accessTokenTTL: 3000 }; // Google's tokens last an hour; leave a margin.
    }
    if (grantType !== "refresh_token") return;
    try {
      const fresh = await refreshAccessToken(env, google.refreshToken);
      const newProps: GoogleProps = {
        ...google,
        accessToken: fresh.access_token,
        refreshToken: fresh.refresh_token ?? google.refreshToken,
      };
      return { newProps, accessTokenTTL: Math.max(fresh.expires_in - 600, 60) };
    } catch (error) {
      if (error instanceof GoogleRevokedError) {
        // Revokes this grant, so Claude asks the user to sign in again instead of retrying forever.
        throw new OAuthError("invalid_grant", { description: "Google access was revoked or expired" });
      }
      throw new OAuthError("temporarily_unavailable", { description: "Google is unavailable", statusCode: 503 });
    }
  },
});
