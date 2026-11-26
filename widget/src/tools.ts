import type { App } from '@modelcontextprotocol/ext-apps'

import { DEMO_CONTACTS, type ContactSource } from '../../src/contacts'
import { TOOL, type Batch, type Decided, type Heard } from '../../src/contract'
import { Game, type GameState, type StateStore } from '../../src/game'

/** The three things the widget asks the server to do. Everything it shows comes back from these. */
export interface Tools {
  next(): Promise<Batch>
  keep(id: string, gratitude: string, spoken: boolean): Promise<Decided>
  letGo(id: string): Promise<Decided>
  /** Turns a recording into words. Missing in fake mode, which has no server to ask. */
  transcribe?(audio: string, mimeType: string): Promise<Heard>
}

const SAVE_FAILED = "That didn't save. Try again."

const WAIT_MS = 25_000
const TOO_SLOW = 'That took too long to write down. Try again, type it, or say it to the assistant.'

const slow = () => new Promise<never>((_, reject) => setTimeout(() => reject(new Error(TOO_SLOW)), WAIT_MS))

/** Sends the clip straight to the server. Returns nothing when the chat app blocks the request, so the caller can try another way. */
async function post(audio: string, mimeType: string): Promise<Heard | undefined> {
  const url = document.querySelector<HTMLMetaElement>('meta[name="day19-transcribe"]')?.content
  if (!url?.startsWith('http')) return undefined
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ audio, mimeType }),
      signal: AbortSignal.timeout(WAIT_MS),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') throw new Error(TOO_SLOW)
    return undefined
  }
  const body = (await response.json().catch(() => ({}))) as Partial<Heard> & { error?: string }
  if (!response.ok || typeof body.text !== 'string') throw new Error(body.error ?? "Couldn't turn that into words. Try again or type it.")
  return { text: body.text }
}

/** The real thing: each call is an MCP tool call through the chat app the widget is sitting in. */
export function mcpTools(app: App): Tools {
  async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const result = await app.callServerTool({ name, arguments: args })
    if (result.isError || !result.structuredContent) {
      const said = result.content?.find((block) => block.type === 'text')
      throw new Error(said?.type === 'text' ? said.text : SAVE_FAILED)
    }
    return result.structuredContent as T
  }
  return {
    next: () => call<Batch>(TOOL.next, {}),
    keep: (id, gratitude, spoken) => call<Decided>(TOOL.keep, { id, gratitude, spoken }),
    letGo: (id) => call<Decided>(TOOL.letGo, { id }),
    transcribe: async (audio, mimeType) => {
      const direct = await post(audio, mimeType)
      if (direct) return direct
      // The chat app wouldn't let the widget reach the server itself, so the clip goes as a tool call instead.
      return Promise.race([call<Heard>(TOOL.transcribe, { audio, mimeType }), slow()])
    },
  }
}

/** Fake mode, for a plain browser tab: the same rules as the server, on made-up contacts that reset on reload. */
export function fakeTools(): Tools {
  let contacts = DEMO_CONTACTS
  let state: GameState | undefined
  const source: ContactSource = { list: async () => contacts, remove: async (id) => void (contacts = contacts.filter((c) => c.id !== id)) }
  const store: StateStore = { load: async () => structuredClone(state), save: async (next) => void (state = structuredClone(next)) }
  const game = new Game(source, store)
  return { next: () => game.next(), keep: (id, gratitude, spoken) => game.keep(id, gratitude, spoken), letGo: (id) => game.letGo(id) }
}
