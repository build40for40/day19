import { DurableObject } from 'cloudflare:workers'

import { DEMO_CONTACTS, type ContactSource } from './contacts'
import type { Batch, Contact, Decided, Progress } from './contract'
import { Game, GameError, type GameState, type StateStore } from './game'

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string }

/** A rule being broken comes back as a message for the person. Anything else is a real failure and still throws. */
async function outcome<T>(run: () => Promise<T>): Promise<Outcome<T>> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    if (error instanceof GameError) return { ok: false, error: error.message }
    throw error
  }
}

/**
 * One person's Brain: their decisions, today's five and, until Google sign-in exists, a made-up contacts list.
 * Swap `source` for a Google People API one and nothing else here changes.
 */
export class Brain extends DurableObject {
  private readonly source: ContactSource = {
    list: async () => (await this.ctx.storage.get<Contact[]>('contacts')) ?? DEMO_CONTACTS,
    remove: async (id) => {
      const contacts = (await this.ctx.storage.get<Contact[]>('contacts')) ?? DEMO_CONTACTS
      await this.ctx.storage.put('contacts', contacts.filter((contact) => contact.id !== id))
    },
  }

  private readonly store: StateStore = {
    load: () => this.ctx.storage.get<GameState>('state'),
    save: (state) => this.ctx.storage.put('state', state),
  }

  private readonly game = new Game(this.source, this.store)

  next(limit?: number): Promise<Batch> {
    return this.game.next(limit)
  }

  progress(): Promise<Progress> {
    return this.game.progress()
  }

  keep(id: string, gratitude: string, spoken: boolean): Promise<Outcome<Decided>> {
    return outcome(() => this.game.keep(id, gratitude, spoken))
  }

  letGo(id: string): Promise<Outcome<Decided>> {
    return outcome(() => this.game.letGo(id))
  }

  markdown(): Promise<string> {
    return this.game.brain()
  }

  /** Demo only: puts every made-up contact back and empties the Brain. */
  async reset(): Promise<Batch> {
    await this.ctx.storage.deleteAll()
    return this.game.next()
  }
}
