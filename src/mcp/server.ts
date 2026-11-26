import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import { McpServer } from '@modelcontextprotocol/server'
import { createMcpHandler } from 'agents/mcp/server'
import { z } from 'zod'

import widgetHtml from '../../dist/widget.html'
import type { Outcome } from '../brain'
import { DEMO_USER, MCP_PATH, type Env } from '../env'
import { MAX_GRATITUDE, type Today } from '../game'
import { SERVER_INSTRUCTIONS, SERVER_NAME, TOOLS, todayText, WIDGET_URI } from './text'

const ui = { ui: { resourceUri: WIDGET_URI } }

const shown = (today: Today) => ({ content: [{ type: 'text' as const, text: todayText(today) }], structuredContent: { ...today } })

const decided = (result: Outcome<Today>) =>
  result.ok ? shown(result.value) : { content: [{ type: 'text' as const, text: result.error }], isError: true }

/** A fresh server per request. All state lives in the person's Brain. */
export function createServer(env: Env, user: string): McpServer {
  const brain = env.BRAINS.get(env.BRAINS.idFromName(user))
  const server = new McpServer({ name: SERVER_NAME, version: '0.1.0' }, { instructions: SERVER_INSTRUCTIONS })

  registerAppTool(
    server,
    TOOLS.today.name,
    {
      title: TOOLS.today.title,
      description: TOOLS.today.description,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
      _meta: ui,
    },
    async () => shown(await brain.today()),
  )

  registerAppTool(
    server,
    TOOLS.keep.name,
    {
      title: TOOLS.keep.title,
      description: TOOLS.keep.description,
      inputSchema: z.object({
        contact_id: z.string().describe(TOOLS.keep.contactId),
        gratitude: z.string().max(MAX_GRATITUDE * 2).describe(TOOLS.keep.gratitude),
        spoken: z.boolean().optional().describe(TOOLS.keep.spoken),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: ui,
    },
    async ({ contact_id, gratitude, spoken }) => decided(await brain.keep(contact_id, gratitude, spoken ?? false)),
  )

  registerAppTool(
    server,
    TOOLS.delete.name,
    {
      title: TOOLS.delete.title,
      description: TOOLS.delete.description,
      inputSchema: z.object({ contact_id: z.string().describe(TOOLS.delete.contactId) }),
      annotations: { readOnlyHint: false, destructiveHint: true },
      _meta: ui,
    },
    async ({ contact_id }) => decided(await brain.delete(contact_id)),
  )

  server.registerTool(
    TOOLS.brain.name,
    { title: TOOLS.brain.title, description: TOOLS.brain.description, annotations: { readOnlyHint: true } },
    async () => ({ content: [{ type: 'text', text: await brain.markdown() }] }),
  )

  registerAppTool(
    server,
    TOOLS.reset.name,
    {
      title: TOOLS.reset.title,
      description: TOOLS.reset.description,
      inputSchema: z.object({}),
      annotations: { readOnlyHint: false, destructiveHint: true },
      _meta: ui,
    },
    async () => shown(await brain.reset()),
  )

  registerAppResource(server, TOOLS.today.title, WIDGET_URI, { description: "Today's five contacts" }, async () => ({
    contents: [
      {
        uri: WIDGET_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: widgetHtml,
        // The mic is for speaking the gratitude. Hosts may refuse it, and the widget falls back to typing.
        _meta: { ui: { permissions: { microphone: {} }, prefersBorder: false } },
      },
    ],
  }))

  return server
}

export function handleMcp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const handler = createMcpHandler(() => createServer(env, DEMO_USER), {
    route: MCP_PATH,
    onerror: (error) => console.error('MCP request failed:', error.name),
  })
  return handler(request, env, ctx)
}
