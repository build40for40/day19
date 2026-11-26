import { DurableObject } from 'cloudflare:workers'

import { DEMO_CONTACTS, type Contact, type ContactSource } from './contacts'
import { Game, GameError, type GameState, type StateStore, type Today } from './game'

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

  today(): Promise<Today> {
    return this.game.today()
  }

  keep(id: string, gratitude: string, spoken: boolean): Promise<Outcome<Today>> {
    return outcome(() => this.game.keep(id, gratitude, spoken))
  }

  delete(id: string): Promise<Outcome<Today>> {
    return outcome(() => this.game.delete(id))
  }

  markdown(): Promise<string> {
    return this.game.brain()
  }

  /** Demo only: puts every made-up contact back and empties the Brain. */
  async reset(): Promise<Today> {
    await this.ctx.storage.deleteAll()
    return this.game.today()
  }
}
