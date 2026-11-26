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
  return {
    game: new Game(source, store, () => now),
    contacts: () => contacts,
    setNow: (iso: string) => (now = new Date(iso)),
    /** Someone adds contacts to their address book part way through the day. */
    grow: (count: number) => void (contacts = [...contacts, ...people(count).filter((c) => !contacts.some((have) => have.id === c.id))]),
  }
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
    // Nobody kept can be thanked again on the day they were kept.
    expect(await game.next()).toEqual({ contacts: [], progress: { decided: 5, total: 8 }, doneForToday: true, thankAgain: 0 })
    setNow('2026-11-27T09:00:00Z')
    const day2 = await game.next()
    // The three nobody has sorted come first, then the hand fills up with people kept yesterday, back for fresh thanks.
    expect(initials(day2.contacts)).toEqual(['X', 'Y', 'Z', 'S', 'T'])
    expect(day2.doneForToday).toBe(false)
  })

  it('tops a short hand up to five when more contacts appear the same day', async () => {
    const { game, grow } = setup(2)
    const first = await game.next()
    expect(initials(first.contacts)).toEqual(['Y', 'Z'])
    await game.keep(first.contacts[0]!.id, 'thank you')
    await game.letGo(first.contacts[1]!.id)
    expect((await game.next()).doneForToday).toBe(true)

    grow(8)
    const more = await game.next()
    expect(more.doneForToday).toBe(false)
    // Three more, A to Z from the newcomers, to make five for the day. The two already decided still count.
    expect(initials(more.contacts)).toEqual(['S', 'T', 'U'])
    for (const contact of more.contacts) await game.keep(contact.id, 'thank you')
    const after = await game.next()
    expect(after).toMatchObject({ contacts: [], doneForToday: true, progress: { decided: 5, total: 8 } })
  })

  it('never deals more than five in a day, however many contacts are added', async () => {
    const { game, grow } = setup(5)
    for (const contact of (await game.next()).contacts) await game.keep(contact.id, 'thank you')
    grow(8)
    expect(await game.next()).toMatchObject({ contacts: [], doneForToday: true })
  })

  it('deals five more on request once the day\'s five are done, as often as asked', async () => {
    const { game } = setup(12)
    const first = await game.next()
    // Asking for more while any are still waiting changes nothing.
    expect((await game.next(undefined, true)).contacts).toEqual(first.contacts)
    for (const contact of first.contacts) await game.keep(contact.id, 'thank you')
    expect(await game.next()).toMatchObject({ contacts: [], doneForToday: true })

    const second = await game.next(undefined, true)
    expect(initials(second.contacts)).toEqual(['T', 'U', 'V', 'W', 'X'])
    expect(second.doneForToday).toBe(false)
    // A plain next keeps showing the round in play, and deciding from it works.
    expect((await game.next()).contacts).toEqual(second.contacts)
    for (const contact of second.contacts) await game.letGo(contact.id)

    const third = await game.next(undefined, true)
    expect(initials(third.contacts)).toEqual(['Y', 'Z'])
    for (const contact of third.contacts) await game.keep(contact.id, 'thank you')
    expect(await game.next(undefined, true)).toMatchObject({ contacts: [], doneForToday: true, progress: { decided: 12, total: 12 } })
  })

  it('brings kept people back round the next day for fresh thanks, oldest thanks first, never anyone let go', async () => {
    const { game, setNow } = setup(3)
    const [a, b, c] = (await game.next()).contacts
    await game.keep(a!.id, 'first thanks to a')
    setNow('2026-11-26T11:00:00Z')
    await game.keep(b!.id, 'first thanks to b')
    await game.letGo(c!.id)
    // The same day, nobody comes back: they were all just thanked.
    expect((await game.next(5, true)).contacts).toEqual([])
    // The next day both kept people are back, oldest thanks first, with what they were thanked for last time.
    setNow('2026-11-27T10:00:00Z')
    const tomorrow = await game.next()
    expect(tomorrow.contacts.map((x) => x.id)).toEqual([a!.id, b!.id])
    expect(tomorrow.thankedBefore?.[a!.id]?.gratitude).toBe('first thanks to a')
    // Thanking again saves the new words, keeps the old ones, and counts as decided for today.
    await game.keep(a!.id, 'second thanks to a')
    await expect(game.keep(a!.id, 'third thanks to a')).rejects.toThrow(GameError)
    const brain = await game.brain()
    expect(brain).toContain('Grateful for: second thanks to a')
    expect(brain).toContain('Earlier, on 26 Nov 2026: first thanks to a')
    expect((await game.progress()).decided).toBe(3)
  })

  it('lets a clean list go again on request, with kept people not thanked today', async () => {
    const { game, setNow } = setup(2)
    const [a, b] = (await game.next()).contacts
    await game.keep(a!.id, 'thanks to a')
    await game.keep(b!.id, 'thanks to b')
    // Same day: everyone was thanked today, so there's nobody to bring back yet.
    const same = await game.next(5, true)
    expect(same.contacts).toEqual([])
    expect(same.thankAgain).toBe(0)
    // The next day they're back in the hand, and once they're thanked, asking for more finds nobody else today.
    setNow('2026-11-27T10:00:00Z')
    const again = await game.next()
    expect(again.contacts.map((x) => x.id)).toEqual([a!.id, b!.id])
    expect(again.doneForToday).toBe(false)
    await game.keep(a!.id, 'more thanks to a')
    await game.keep(b!.id, 'more thanks to b')
    expect((await game.next(5, true)).contacts).toEqual([])
  })

  it('deals new contacts before kept people who are due', async () => {
    const { game, setNow, grow } = setup(1)
    const [a] = (await game.next()).contacts
    await game.keep(a!.id, 'thanks to a')
    setNow('2026-11-27T10:00:00Z')
    grow(2)
    const hand = (await game.next()).contacts.map((x) => x.id)
    expect(hand).toEqual(['c1', a!.id])
  })

  it('says so when the Brain is empty', async () => {
    expect(await setup().game.brain()).toContain('Nobody here yet')
  })

  it('lists everyone kept as thank-you notes, newest first, and skips anyone let go', async () => {
    const { game, setNow } = setup()
    const [a, b, c] = (await game.next()).contacts
    await game.keep(a!.id, 'teaching me mah jong')
    setNow('2026-11-26T11:00:00Z')
    await game.keep(b!.id, 'feeding my cat')
    await game.letGo(c!.id)
    const notes = await game.thankYous()
    expect(notes.map((n) => n.gratitude)).toEqual(['feeding my cat', 'teaching me mah jong'])
    expect(notes[1]).toEqual({ id: a!.id, name: a!.name, emails: a!.emails, gratitude: 'teaching me mah jong', keptOn: '2026-11-26T10:00:00.000Z' })
    expect(await game.thankYous()).toEqual([])
    expect(await game.thankYous({ id: a!.id })).toHaveLength(1)
    expect(await game.thankYous({ all: true })).toHaveLength(2)
  })
})
