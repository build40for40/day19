import { describe, expect, it } from 'vitest'

import type { Contact, ContactSource } from './contacts'
import { Game, GameError, type GameState, type StateStore } from './game'

const people = (n: number): Contact[] =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `${String.fromCharCode(90 - i)} Person`, email: `p${i}@example.com` }))

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

describe('Game', () => {
  it('surfaces five contacts a day, A to Z, and keeps the same five all day', async () => {
    const { game, setNow } = setup()
    const first = await game.today()
    expect(first.contacts.map((c) => c.name[0])).toEqual(['S', 'T', 'U', 'V', 'W'])
    expect(first.remaining).toBe(5)
    setNow('2026-11-26T22:00:00Z')
    expect((await game.today()).contacts).toEqual(first.contacts)
  })

  it('keeps a contact only with gratitude, and leaves it in the source', async () => {
    const { game, contacts } = setup()
    const [first] = (await game.today()).contacts
    await expect(game.keep(first!.id, '  ')).rejects.toThrow(GameError)
    const after = await game.keep(first!.id, ' She told me my  writing was worth reading ', true)
    expect(after.contacts[0]!.decision).toMatchObject({ kind: 'kept', gratitude: 'She told me my writing was worth reading', spoken: true })
    expect(after.remaining).toBe(4)
    expect(contacts()).toHaveLength(8)
    expect(await game.brain()).toContain('- Grateful for: She told me my writing was worth reading (spoken)')
  })

  it('deletes a contact from the source but keeps a copy in the Brain', async () => {
    const { game, contacts } = setup()
    const [first] = (await game.today()).contacts
    const after = await game.delete(first!.id)
    expect(after.contacts[0]!.decision?.kind).toBe('deleted')
    expect(contacts().some((c) => c.id === first!.id)).toBe(false)
    const brain = await game.brain()
    expect(brain).toContain('## Let go')
    expect(brain).toContain(`### ${first!.name}`)
    expect(brain).toContain(`- Email: ${first!.email}`)
  })

  it('refuses a second decision and unknown contacts', async () => {
    const { game } = setup()
    const [first] = (await game.today()).contacts
    await game.delete(first!.id)
    await expect(game.keep(first!.id, 'thank you')).rejects.toThrow('already been decided')
    await expect(game.delete('nope')).rejects.toThrow('No contact')
  })

  it('picks the next undecided contacts on a new UK day', async () => {
    const { game, setNow } = setup()
    const day1 = await game.today()
    await game.keep(day1.contacts[0]!.id, 'thank you')
    await game.delete(day1.contacts[1]!.id)
    setNow('2026-11-27T09:00:00Z')
    const day2 = await game.today()
    expect(day2.date).toBe('2026-11-27')
    // The three nobody decided on come round again, then the next two.
    expect(day2.contacts.map((c) => c.name[0])).toEqual(['U', 'V', 'W', 'X', 'Y'])
    expect(day2.remaining).toBe(5)
  })

  it('says so when the Brain is empty', async () => {
    expect(await setup().game.brain()).toContain('Nobody here yet')
  })
})
