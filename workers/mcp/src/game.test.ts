import { describe, expect, it } from 'vitest'

import type { ContactSource } from './contacts'
import type { Contact } from './contract'
import { Game, GameError, type GameState, type StateStore } from './game'

const people = (n: number): Contact[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    name: `${String.fromCharCode(90 - i)} Person`,
    emails: [`p${i}@example.com`],
    phones: [],
    photoUrl: null,
    organisation: 'Example Ltd',
  }))

function setup(count = 8, start = '2026-11-26T10:00:00Z') {
  let contacts = people(count)
  let saved: GameState | undefined
  let now = new Date(start)
  const source: ContactSource = {
    list: async () => contacts,
    remove: async (id) => void (contacts = contacts.filter((c) => c.id !== id)),
  }
  const store: StateStore = { load: async () => structuredClone(saved), save: async (s) => void (saved = structuredClone(s)) }
  return { game: new Game(source, store, () => now), contacts: () => contacts, setNow: (iso: string) => (now = new Date(iso)) }
}

const initials = (contacts: Contact[]) => contacts.map((c) => c.name[0])

describe('Game', () => {
  it('surfaces five undecided contacts a day, A to Z, in the contract shape', async () => {
    const { game, setNow } = setup()
    const first = await game.next()
    expect(initials(first.contacts)).toEqual(['S', 'T', 'U', 'V', 'W'])
    expect(first.contacts[0]).toEqual({ id: 'c7', name: 'S Person', emails: ['p7@example.com'], phones: [], photoUrl: null, organisation: 'Example Ltd' })
    expect(first.progress).toEqual({ decided: 0, total: 8 })
    expect(first.doneForToday).toBe(false)
    setNow('2026-11-26T22:00:00Z')
    expect((await game.next()).contacts).toEqual(first.contacts)
    expect(initials((await game.next(2)).contacts)).toEqual(['S', 'T'])
  })

  it('keeps a contact only with gratitude, and leaves it in the source', async () => {
    const { game, contacts } = setup()
    const [first] = (await game.next()).contacts
    await expect(game.keep(first!.id, '  ')).rejects.toThrow(GameError)
    const after = await game.keep(first!.id, ' She told me my  writing was worth reading ')
    expect(after).toEqual({ id: first!.id, decision: 'kept', progress: { decided: 1, total: 8 } })
    expect(contacts()).toHaveLength(8)
    expect(initials((await game.next()).contacts)).toEqual(['T', 'U', 'V', 'W'])
    expect(await game.brain()).toContain('- Grateful for: She told me my writing was worth reading')
  })

  it('lets a contact go from the source but keeps a copy in the Brain, and the total stays put', async () => {
    const { game, contacts } = setup()
    const [first] = (await game.next()).contacts
    expect(await game.letGo(first!.id)).toEqual({ id: first!.id, decision: 'let_go', progress: { decided: 1, total: 8 } })
    expect(contacts().some((c) => c.id === first!.id)).toBe(false)
    expect(await game.progress()).toEqual({ decided: 1, total: 8 })
    const brain = await game.brain()
    expect(brain).toContain('## Let go')
    expect(brain).toContain(`### ${first!.name}`)
    expect(brain).toContain(`- Email: ${first!.emails[0]}`)
  })

  it('refuses a second decision and unknown contacts', async () => {
    const { game } = setup()
    const [first] = (await game.next()).contacts
    await game.letGo(first!.id)
    await expect(game.keep(first!.id, 'thank you')).rejects.toThrow('already been decided')
    await expect(game.letGo('nope')).rejects.toThrow('No contact')
  })

  it('is done for today after five, and picks the next undecided contacts on a new UK day', async () => {
    const { game, setNow } = setup()
    const day1 = await game.next()
    for (const contact of day1.contacts.slice(0, 3)) await game.keep(contact.id, 'thank you')
    for (const contact of day1.contacts.slice(3)) await game.letGo(contact.id)
    expect(await game.next()).toEqual({ contacts: [], progress: { decided: 5, total: 8 }, doneForToday: true })
    setNow('2026-11-27T09:00:00Z')
    const day2 = await game.next()
    expect(initials(day2.contacts)).toEqual(['X', 'Y', 'Z'])
    expect(day2.doneForToday).toBe(false)
  })

  it('says so when the Brain is empty', async () => {
    expect(await setup().game.brain()).toContain('Nobody here yet')
  })
})
