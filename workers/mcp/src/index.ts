// The Worker. OAuthProvider makes it an OAuth server for Claude and ChatGPT:
// - /mcp needs a token from Google sign-in, and plays the game on the person's own contacts.
// - /authorize and /callback are the sign-in pages (auth.ts); the library serves discovery,
//   client registration and /oauth/token itself.
// - /demo/mcp is the same game on made-up contacts, with no sign-in. It is open,
//   as it was before sign-in existed.
// - / is Ben's landing page from landing/, and /privacy the privacy policy.
// Everything lives on MCP_RESOURCE's host; other addresses redirect there first (hosts.ts).

import { OAuthError, OAuthProvider } from '@cloudflare/workers-oauth-provider'
import { env } from 'cloudflare:workers'

import { authHandler } from './auth'
import { DEMO_MCP_PATH, MCP_PATH } from './env'
import { GoogleRevokedError, refreshAccessToken, type GoogleProps } from './google'
import { redirectToHome } from './hosts'
import { handleMcp } from './mcp/server'

export { Brain } from './brain'

const openRoutes = {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === DEMO_MCP_PATH) return handleMcp(request, env, ctx, { kind: 'demo' }, DEMO_MCP_PATH)
    return authHandler.fetch(request, env as Parameters<typeof authHandler.fetch>[1], ctx)
  },
}

const provider = new OAuthProvider<Env>({
  apiRoute: MCP_PATH,
  apiHandler: {
    fetch(request: Request, env: Env, ctx: ExecutionContext) {
      // ctx.props is what auth.ts passed to completeAuthorization(), decrypted for this token.
      return handleMcp(request, env, ctx, { kind: 'google', google: ctx.props as GoogleProps }, MCP_PATH)
    },
  },
  defaultHandler: openRoutes as ExportedHandler<Env>,
  authorizeEndpoint: '/authorize',
  tokenEndpoint: '/oauth/token',
  clientRegistrationEndpoint: '/oauth/register',
  scopesSupported: ['contacts'],
  resourceMetadata: { resource: env.MCP_RESOURCE },

  // Keeps the Google token inside the grant fresh. Our access token lives exactly as long
  // as Google's, and each time Claude refreshes ours, we refresh Google's.
  tokenExchangeCallback: async ({ grantType, props }) => {
    const google = props as GoogleProps
    if (grantType === 'authorization_code') {
      return { accessTokenTTL: 3000 } // Google's tokens last an hour; leave a margin.
    }
    if (grantType !== 'refresh_token') return
    try {
      const fresh = await refreshAccessToken(env, google.refreshToken)
      const newProps: GoogleProps = {
        ...google,
        accessToken: fresh.access_token,
        refreshToken: fresh.refresh_token ?? google.refreshToken,
      }
      return { newProps, accessTokenTTL: Math.max(fresh.expires_in - 600, 60) }
    } catch (error) {
      if (error instanceof GoogleRevokedError) {
        // Revokes this grant, so Claude asks the person to sign in again instead of retrying forever.
        throw new OAuthError('invalid_grant', { description: 'Google access was revoked or expired' })
      }
      throw new OAuthError('temporarily_unavailable', { description: 'Google is unavailable', statusCode: 503 })
    }
  },
})

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> | Response {
    return redirectToHome(request, env.MCP_RESOURCE) ?? provider.fetch(request, env, ctx)
  },
} satisfies ExportedHandler<Env>
