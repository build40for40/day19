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
    transcribe: (audio, mimeType) => call<Heard>(TOOL.transcribe, { audio, mimeType }),
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
