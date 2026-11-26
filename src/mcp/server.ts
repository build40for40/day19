import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import { McpServer } from '@modelcontextprotocol/server'
import { createMcpHandler } from 'agents/mcp/server'

import widgetHtml from '../../dist/widget.html'
import type { Outcome } from '../brain'
import { TOOL, type Batch, type Decided } from '../contract'
import { DEMO_USER, MCP_PATH, TRANSCRIBE_PATH, type Env } from '../env'
import { hear } from '../hear'
import * as schema from './schemas'
import { BRAIN_TOOL, batchText, decidedText, progressText, RESET_TOOL, SERVER_INSTRUCTIONS, SERVER_NAME, TEXT } from './text'

// Chat apps cache the widget by its address, so the address changes whenever the built widget does.
const WIDGET_URI = `ui://gobbler/contacts-${[...widgetHtml].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0, 7).toString(36)}.html`

const API_PLACEHOLDER = '__GOBBLER_TRANSCRIBE_URL__'

const text = (value: string) => [{ type: 'text' as const, text: value }]

// Every result carries the same thing twice: text for the model, structuredContent for the widget.
const batchResult = (batch: Batch) => ({ content: text(batchText(batch)), structuredContent: { ...batch } })

/** A broken rule comes back as `isError` with a sentence the widget can show as it is. */
const decidedResult = (result: Outcome<Decided>) =>
  result.ok
    ? { content: text(decidedText(result.value)), structuredContent: { ...result.value } }
    : { content: text(result.error), isError: true }

/** A fresh server per request. All state lives in the person's Brain. */
/** `base` is the address the Worker was reached at, like https://build40for40.com/gobbler, so voice clips go back the same way. */
export function createServer(env: Env, user: string, base: string): McpServer {
  const brain = env.BRAINS.get(env.BRAINS.idFromName(user))
  const server = new McpServer({ name: SERVER_NAME, version: '0.2.0' }, { instructions: SERVER_INSTRUCTIONS })

  // The only tool with a widget. The rest return data, for the widget's buttons and for the assistant.
  registerAppTool(
    server,
    TOOL.start,
    {
      ...TEXT.start,
      inputSchema: schema.nothing,
      outputSchema: schema.batch,
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: WIDGET_URI } },
    },
    async () => batchResult(await brain.next()),
  )

  server.registerTool(
    TOOL.next,
    {
      title: TEXT.next.title,
      description: TEXT.next.description,
      inputSchema: schema.nextInput,
      outputSchema: schema.batch,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ limit }) => batchResult(await brain.next(limit)),
  )

  server.registerTool(
    TOOL.keep,
    {
      title: TEXT.keep.title,
      description: TEXT.keep.description,
      inputSchema: schema.keepInput,
      outputSchema: schema.decided,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ id, gratitude, spoken }) => decidedResult(await brain.keep(id, gratitude, spoken ?? false)),
  )

  server.registerTool(
    TOOL.letGo,
    {
      title: TEXT.letGo.title,
      description: TEXT.letGo.description,
      inputSchema: schema.letGoInput,
      outputSchema: schema.decided,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async ({ id }) => decidedResult(await brain.letGo(id)),
  )

  server.registerTool(
    TOOL.progress,
    {
      title: TEXT.progress.title,
      description: TEXT.progress.description,
      inputSchema: schema.nothing,
      outputSchema: schema.progress,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const progress = await brain.progress()
      return { content: text(progressText(progress)), structuredContent: { ...progress } }
    },
  )

  // Hidden from the assistant: it is only for the widget's Speak button.
  server.registerTool(
    TOOL.transcribe,
    {
      title: TEXT.transcribe.title,
      description: TEXT.transcribe.description,
      inputSchema: schema.transcribeInput,
      outputSchema: schema.heard,
      annotations: { readOnlyHint: true, openWorldHint: false },
      _meta: { ui: { visibility: ['app'] } },
    },
    async ({ audio }) => {
      const result = await hear(env, audio)
      return result.ok ? { content: text(result.value.text), structuredContent: { ...result.value } } : { content: text(result.error), isError: true }
    },
  )

  server.registerTool(
    BRAIN_TOOL,
    { title: TEXT.brain.title, description: TEXT.brain.description, inputSchema: schema.nothing, annotations: { readOnlyHint: true, openWorldHint: false } },
    async () => ({ content: text(await brain.markdown()) }),
  )

  server.registerTool(
    RESET_TOOL,
    {
      title: TEXT.reset.title,
      description: TEXT.reset.description,
      inputSchema: schema.nothing,
      outputSchema: schema.batch,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async () => batchResult(await brain.reset()),
  )

  registerAppResource(server, TEXT.start.title, WIDGET_URI, { description: 'The keep or let go widget' }, async () => ({
    contents: [
      {
        uri: WIDGET_URI,
        mimeType: RESOURCE_MIME_TYPE,
        // The widget is told where to send voice clips, and the chat app is asked to let it.
        text: widgetHtml.replace(API_PLACEHOLDER, `${base}${TRANSCRIBE_PATH}`),
        _meta: {
          ui: {
            // Contact photos come from Google's image host. Nothing else loads from outside the widget.
            csp: { resourceDomains: ['https://lh3.googleusercontent.com'], connectDomains: [new URL(base).origin] },
            // The mic is for speaking the gratitude. Hosts may refuse it, and the widget falls back to typing.
            permissions: { microphone: {} },
            prefersBorder: false,
          },
        },
      },
    ],
  }))

  return server
}

/** `prefix` is '/gobbler' on build40for40.com and '' on workers.dev or local dev. */
export function handleMcp(request: Request, env: Env, ctx: ExecutionContext, prefix = ''): Promise<Response> {
  const base = new URL(request.url).origin + prefix
  const handler = createMcpHandler(() => createServer(env, DEMO_USER, base), {
    route: prefix + MCP_PATH,
    onerror: (error) => console.error('MCP request failed:', error.name),
  })
  return handler(request, env, ctx)
}
