import { MCP_PATH, type Env } from './env'
import { handleMcp } from './mcp/server'

export { Brain } from './brain'

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url)
    if (pathname === MCP_PATH || pathname.startsWith(`${MCP_PATH}/`)) return handleMcp(request, env, ctx)
    return new Response('Day 19 of 40 for 40. Add this address plus /mcp to Claude as a connector.\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  },
} satisfies ExportedHandler<Env>
