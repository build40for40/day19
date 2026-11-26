// The app lives on one host, the one in MCP_RESOURCE (gobbler.build40for40.com). Sign-in tokens are
// bound to it, so the app's own routes only work there. Other addresses the Worker answers on:
// - build40for40.com/gobbler/ serves the same site with the /gobbler prefix dropped, and sends the
//   app's routes to the app's host: /gobbler/mcp goes to /mcp.
// - the old workers.dev address redirects everything to the app's host, keeping the path.
// Local dev and tests use MCP_RESOURCE's own host, so they're served as they are.

import { DEMO_MCP_PATH, MCP_PATH } from './env'

const SITE_HOST = 'build40for40.com'
const SITE_PREFIX = '/gobbler'
const OLD_HOSTS = new Set(['day19.40for40.workers.dev'])

const isAppRoute = (path: string) =>
  [MCP_PATH, DEMO_MCP_PATH, '/authorize', '/callback'].includes(path) || path.startsWith('/oauth/') || path.startsWith('/.well-known/')

/** A redirect, or the request to serve, rewritten onto the app's host when it came in under build40for40.com/gobbler/. */
export function routeHost(request: Request, mcpResource: string): Request | Response {
  const url = new URL(request.url)
  const home = new URL(mcpResource)
  if (url.host === home.host) return request

  if (OLD_HOSTS.has(url.hostname)) return Response.redirect(`${home.origin}${url.pathname}${url.search}`, 301)
  if (url.hostname !== SITE_HOST) return request

  // The page's links are relative, so it needs the trailing slash to find its files.
  if (url.pathname === SITE_PREFIX) return Response.redirect(`${url.origin}${SITE_PREFIX}/${url.search}`, 301)
  if (!url.pathname.startsWith(`${SITE_PREFIX}/`)) return request

  const path = url.pathname.slice(SITE_PREFIX.length)
  if (isAppRoute(path)) return Response.redirect(`${home.origin}${path}${url.search}`, 301)
  return new Request(`${home.origin}${path}${url.search}`, request)
}
