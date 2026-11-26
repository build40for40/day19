import { BASE_PATH, MCP_PATH, TRANSCRIBE_PATH, type Env } from './env'
import { handleTranscribe } from './hear'
import { handleMcp } from './mcp/server'

export { Brain } from './brain'

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url)
    // On build40for40.com everything sits under /gobbler. workers.dev and local dev serve the same paths at the root.
    const prefix = pathname === BASE_PATH || pathname.startsWith(`${BASE_PATH}/`) ? BASE_PATH : ''
    const path = pathname.slice(prefix.length)
    if (path === MCP_PATH || path.startsWith(`${MCP_PATH}/`)) return handleMcp(request, env, ctx, prefix)
    if (path === TRANSCRIBE_PATH) return handleTranscribe(request, env)
    return new Response(`Gobbler, Day 19 of 40 for 40. Add ${new URL(request.url).origin}${prefix}${MCP_PATH} to Claude as a connector.\n`, {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  },
} satisfies ExportedHandler<Env>
