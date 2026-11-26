// The app lives on one host, the one in MCP_RESOURCE (gobbler.build40for40.com). Sign-in tokens are
// bound to it, so every other address the Worker answers on sends people there instead:
// - build40for40.com/gobbler/... drops the /gobbler prefix: /gobbler/privacy goes to /privacy.
// - the old workers.dev address keeps its path: /mcp goes to /mcp.
// Local dev and tests use MCP_RESOURCE's own host, so they're never redirected.

const SITE_HOST = 'build40for40.com'
const SITE_PREFIX = '/gobbler'
const OLD_HOSTS = new Set(['day19.40for40.workers.dev'])

/** A 301 to the app's own host, or null when the request is already there or isn't ours to move. */
export function redirectToHome(request: Request, mcpResource: string): Response | null {
  const url = new URL(request.url)
  const home = new URL(mcpResource)
  if (url.host === home.host) return null

  let path: string
  if (url.hostname === SITE_HOST && (url.pathname === SITE_PREFIX || url.pathname.startsWith(`${SITE_PREFIX}/`))) {
    path = url.pathname.slice(SITE_PREFIX.length) || '/'
  } else if (OLD_HOSTS.has(url.hostname)) {
    path = url.pathname
  } else {
    return null
  }
  return Response.redirect(`${home.origin}${path}${url.search}`, 301)
}
