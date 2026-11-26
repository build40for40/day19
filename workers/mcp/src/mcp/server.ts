import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import { McpServer } from '@modelcontextprotocol/server'
import { createMcpHandler } from 'agents/mcp/server'

import { z } from 'zod'

import widgetHtml from '../../dist/widget.html'
import type { ContactRow, Outcome } from '../brain'
import { TOOL, type Batch, type Decided } from '../contract'
import { DEMO_USER } from '../env'
import { GoogleRevokedError, type GoogleProps } from '../google'
import * as schema from './schemas'
import { BRAIN_TOOL, batchText, decidedText, LIST_TOOL, progressText, RESET_TOOL, SERVER_INSTRUCTIONS, SERVER_NAME, SYNC_TOOL, TEXT } from './text'

// Chat apps cache the widget by its address, so the address changes whenever the built widget does.
const WIDGET_URI = `ui://gobbler/contacts-${[...widgetHtml].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0, 7).toString(36)}.html`

const text = (value: string) => [{ type: 'text' as const, text: value }]

// Every result carries the same thing twice: text for the model, structuredContent for the widget.
const batchResult = (batch: Batch) => ({ content: text(batchText(batch)), structuredContent: { ...batch } })

/** A broken rule comes back as `isError` with a sentence the widget can show as it is. */
const decidedResult = (result: Outcome<Decided>) =>
  result.ok
    ? { content: text(decidedText(result.value)), structuredContent: { ...result.value } }
    : { content: text(result.error), isError: true }

/** Who is calling: someone signed in with Google, or anyone on the demo endpoint. */
export type Session = { kind: 'google'; google: GoogleProps } | { kind: 'demo' }

const REVOKED = 'Google sign-in has expired or was removed. Disconnect and reconnect this app to sign in with Google again.'

/** Turns a lost Google sign-in into a sentence the person can act on, instead of a crash. */
async function guarded<T extends object>(run: () => Promise<T>) {
  try {
    return await run()
  } catch (error) {
    if (error instanceof GoogleRevokedError) return { content: text(REVOKED), isError: true }
    throw error
  }
}

/** A contact from the Brain's copy of Google Contacts, with what was decided. For list_contacts. */
const listed = (c: ContactRow) => ({
  id: c.id,
  name: c.name,
  emails: c.emails,
  phones: c.phones,
  organisation: c.organisation,
  lastEdited: c.updatedAt,
  status: c.status,
  whySurfaced: c.signals,
  gratitude: c.gratitude,
})

/** A fresh server per request. All state lives in the person's Brain. */
export function createServer(env: Env, session: Session): McpServer {
  const user = session.kind === 'google' ? session.google.userId : DEMO_USER
  // Signed-in Brains need the Google token for every call. The demo Brain needs none.
  const token = session.kind === 'google' ? session.google.accessToken : undefined
  const brain = env.BRAINS.get(env.BRAINS.idFromName(user))
  const server = new McpServer({ name: SERVER_NAME, version: '0.3.0' }, { instructions: SERVER_INSTRUCTIONS })

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
    () => guarded(async () => batchResult(await brain.next(undefined, token))),
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
    ({ limit }) => guarded(async () => batchResult(await brain.next(limit, token))),
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
    ({ id, gratitude }) => guarded(async () => decidedResult(await brain.keep(id, gratitude, token))),
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
    ({ id }) => guarded(async () => decidedResult(await brain.letGo(id, token))),
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
    () =>
      guarded(async () => {
        const progress = await brain.progress(token)
        return { content: text(progressText(progress)), structuredContent: { ...progress } }
      }),
  )

  server.registerTool(
    BRAIN_TOOL,
    { title: TEXT.brain.title, description: TEXT.brain.description, inputSchema: schema.nothing, annotations: { readOnlyHint: true, openWorldHint: false } },
    () => guarded(async () => ({ content: text(await brain.markdown(token)) })),
  )

  if (session.kind === 'google') registerGoogleTools(server, brain, session.google.accessToken)
  else registerDemoTools(server, brain)

  registerWidget(server)
  return server
}

/** Only for signed-in people: their Google Contacts as the Brain holds them. */
function registerGoogleTools(server: McpServer, brain: DurableObjectStub<import('../brain').Brain>, token: string) {
  server.registerTool(
    SYNC_TOOL,
    {
      title: TEXT.sync.title,
      description: TEXT.sync.description,
      inputSchema: z.object({ force: z.boolean().optional().describe(TEXT.sync.force) }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ force }) =>
      guarded(async () => {
        const result = await brain.sync(token, { force })
        return {
          content: text(`Synced (${result.mode}): ${result.changed} changed, ${result.total} contacts in Google.`),
          structuredContent: { ...result },
        }
      }),
  )

  server.registerTool(
    LIST_TOOL,
    {
      title: TEXT.list.title,
      description: TEXT.list.description,
      inputSchema: z.object({
        status: z.enum(['new', 'kept', 'let_go']).optional().describe(TEXT.list.status),
        search: z.string().max(100).optional().describe(TEXT.list.search),
        limit: z.number().int().min(1).max(200).optional().describe(TEXT.list.limit),
        offset: z.number().int().min(0).optional().describe(TEXT.list.offset),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) =>
      guarded(async () => {
        await brain.sync(token)
        const { total, offset, contacts } = await brain.listContacts(args)
        const next = offset + contacts.length
        const data = { total, offset, nextOffset: next < total ? next : null, contacts: contacts.map(listed) }
        return { content: text(`Showing ${contacts.length} of ${total} contacts.\n\n${JSON.stringify(data, null, 2)}`), structuredContent: data }
      }),
  )
}

/** Only on the demo endpoint: start the made-up contacts again. */
function registerDemoTools(server: McpServer, brain: DurableObjectStub<import('../brain').Brain>) {
  server.registerTool(
    RESET_TOOL,
    {
      title: TEXT.reset.title,
      description: TEXT.reset.description,
      inputSchema: schema.nothing,
      outputSchema: schema.batch,
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    async () => {
      const result = await brain.reset()
      return result.ok ? batchResult(result.value) : { content: text(result.error), isError: true }
    },
  )
}

function registerWidget(server: McpServer) {
  registerAppResource(server, TEXT.start.title, WIDGET_URI, { description: 'The keep or let go widget' }, async () => ({
    contents: [
      {
        uri: WIDGET_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: widgetHtml,
        _meta: {
          ui: {
            // Contact photos come from Google's image host. Nothing else loads from outside the widget.
            csp: { resourceDomains: ['https://lh3.googleusercontent.com'] },
            prefersBorder: false,
          },
        },
      },
    ],
  }))
}

/** Serves one MCP request at `route`, as the signed-in person or as the demo. */
export function handleMcp(request: Request, env: Env, ctx: ExecutionContext, session: Session, route: string): Promise<Response> {
  const handler = createMcpHandler(() => createServer(env, session), {
    route,
    onerror: (error) => console.error('MCP request failed:', error.name),
  })
  return handler(request, env, ctx)
}
