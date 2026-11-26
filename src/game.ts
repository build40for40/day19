import type { Contact, ContactSource } from './contacts'

export const DAILY_COUNT = 5
export const MIN_GRATITUDE = 3
export const MAX_GRATITUDE = 280

export type Decision =
  | { kind: 'kept'; gratitude: string; spoken: boolean; at: string }
  | { kind: 'deleted'; at: string }

/** One person in the Brain: the contact as it was, and what was decided about them. */
export interface BrainEntry {
  contact: Contact
  decision: Decision
}

export interface GameState {
  /** The UK date the current five were picked for, as YYYY-MM-DD. */
  date?: string
  /** Today's contacts, frozen when the day's five were picked so they survive being deleted from the source. */
  today: Contact[]
  brain: Record<string, BrainEntry>
}

export interface StateStore {
  load(): Promise<GameState | undefined>
  save(state: GameState): Promise<void>
}

export interface TodayCard extends Contact {
  decision?: Decision
}

export interface Today {
  date: string
  contacts: TodayCard[]
  /** How many of today's contacts still need a decision. */
  remaining: number
}

export class GameError extends Error {}

const ukDate = (now: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now)

/** The rules of the day: five contacts, each deleted or kept with gratitude, and everything written to the Brain. */
export class Game {
  constructor(
    private readonly source: ContactSource,
    private readonly store: StateStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async state(): Promise<GameState> {
    const state = (await this.store.load()) ?? { today: [], brain: {} }
    const date = ukDate(this.now())
    if (state.date === date) return state
    // A new day: the next five nobody has decided on yet, A to Z.
    const undecided = (await this.source.list()).filter((contact) => !state.brain[contact.id])
    const today = undecided.toSorted((a, b) => a.name.localeCompare(b.name, 'en')).slice(0, DAILY_COUNT)
    const next = { ...state, date, today }
    await this.store.save(next)
    return next
  }

  private view(state: GameState): Today {
    const contacts = state.today.map((contact) => ({ ...contact, decision: state.brain[contact.id]?.decision }))
    return { date: state.date ?? ukDate(this.now()), contacts, remaining: contacts.filter((c) => !c.decision).length }
  }

  async today(): Promise<Today> {
    return this.view(await this.state())
  }

  private pending(state: GameState, id: string): Contact {
    const contact = state.today.find((c) => c.id === id)
    if (!contact) throw new GameError(`No contact with id "${id}" in today's five.`)
    if (state.brain[id]) throw new GameError(`${contact.name} has already been decided today.`)
    return contact
  }

  async keep(id: string, gratitude: string, spoken = false): Promise<Today> {
    const state = await this.state()
    const contact = this.pending(state, id)
    const text = gratitude.trim().replace(/\s+/g, ' ')
    if (text.length < MIN_GRATITUDE) throw new GameError(`Say what you're grateful to ${contact.name} for first.`)
    if (text.length > MAX_GRATITUDE) throw new GameError(`Keep it under ${MAX_GRATITUDE} characters.`)
    state.brain[id] = { contact, decision: { kind: 'kept', gratitude: text, spoken, at: this.now().toISOString() } }
    await this.store.save(state)
    return this.view(state)
  }

  async delete(id: string): Promise<Today> {
    const state = await this.state()
    const contact = this.pending(state, id)
    // The Brain gets its copy first, so a failed delete never loses anyone.
    state.brain[id] = { contact, decision: { kind: 'deleted', at: this.now().toISOString() } }
    await this.store.save(state)
    await this.source.remove(id)
    return this.view(state)
  }

  async brain(): Promise<string> {
    return brainMarkdown(Object.values((await this.state()).brain))
  }
}

const day = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

/** The Brain as one markdown file: everyone kept with their gratitude, then everyone let go. */
export function brainMarkdown(entries: BrainEntry[]): string {
  const sorted = entries.toSorted((a, b) => a.contact.name.localeCompare(b.contact.name, 'en'))
  const section = (title: string, kind: Decision['kind']) => {
    const people = sorted.filter((entry) => entry.decision.kind === kind)
    if (!people.length) return []
    return [`## ${title}`, '', ...people.flatMap(person)]
  }
  const person = ({ contact, decision }: BrainEntry) => [
    `### ${contact.name}`,
    '',
    ...(decision.kind === 'kept' ? [`- Grateful for: ${decision.gratitude}${decision.spoken ? ' (spoken)' : ''}`] : []),
    `- ${decision.kind === 'kept' ? 'Kept' : 'Deleted from contacts'} on ${day(decision.at)}`,
    ...(contact.detail ? [`- Detail: ${contact.detail}`] : []),
    ...(contact.email ? [`- Email: ${contact.email}`] : []),
    ...(contact.phone ? [`- Phone: ${contact.phone}`] : []),
    '',
  ]
  if (!sorted.length) return '# Brain\n\nNobody here yet.\n'
  return ['# Brain', '', ...section('Kept, with thanks', 'kept'), ...section('Let go', 'deleted')].join('\n').trimEnd() + '\n'
}
