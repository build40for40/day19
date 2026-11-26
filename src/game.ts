import type { ContactSource } from './contacts'
import { BATCH_SIZE, MAX_GRATITUDE, MIN_GRATITUDE, type Batch, type Contact, type Decided, type Progress } from './contract'

export type Decision = { kind: 'kept'; gratitude: string; spoken: boolean; at: string } | { kind: 'let_go'; at: string }

/** One person in the Brain: the contact as it was, and what was decided about them. */
export interface BrainEntry {
  contact: Contact
  decision: Decision
}

export interface GameState {
  /** The UK date today's contacts were picked for, as YYYY-MM-DD. */
  date?: string
  /** Today's contacts, picked once a day. */
  today: Contact[]
  brain: Record<string, BrainEntry>
}

export interface StateStore {
  load(): Promise<GameState | undefined>
  save(state: GameState): Promise<void>
}

export class GameError extends Error {}

const ukDate = (now: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now)

/** The rules: five contacts a day, each let go or kept with gratitude, and everything written to the Brain. */
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
    const today = undecided.toSorted((a, b) => a.name.localeCompare(b.name, 'en')).slice(0, BATCH_SIZE)
    const next = { ...state, date, today }
    await this.store.save(next)
    return next
  }

  private async count(state: GameState): Promise<Progress> {
    const ids = new Set([...Object.keys(state.brain), ...(await this.source.list()).map((contact) => contact.id)])
    return { decided: Object.keys(state.brain).length, total: ids.size }
  }

  async next(limit = BATCH_SIZE): Promise<Batch> {
    const state = await this.state()
    const waiting = state.today.filter((contact) => !state.brain[contact.id])
    return { contacts: waiting.slice(0, limit), progress: await this.count(state), doneForToday: waiting.length === 0 }
  }

  async progress(): Promise<Progress> {
    return this.count(await this.state())
  }

  private waiting(state: GameState, id: string): Contact {
    const contact = state.today.find((c) => c.id === id)
    if (!contact) throw new GameError(`No contact with id "${id}" in today's five.`)
    if (state.brain[id]) throw new GameError(`${contact.name} has already been decided.`)
    return contact
  }

  async keep(id: string, gratitude: string, spoken = false): Promise<Decided> {
    const state = await this.state()
    const contact = this.waiting(state, id)
    const text = gratitude.trim().replace(/\s+/g, ' ')
    if (text.length < MIN_GRATITUDE) throw new GameError(`Say what you're grateful to ${contact.name} for first.`)
    if (text.length > MAX_GRATITUDE) throw new GameError(`Keep it under ${MAX_GRATITUDE} characters.`)
    state.brain[id] = { contact, decision: { kind: 'kept', gratitude: text, spoken, at: this.now().toISOString() } }
    await this.store.save(state)
    return { id, decision: 'kept', progress: await this.count(state) }
  }

  async letGo(id: string): Promise<Decided> {
    const state = await this.state()
    const contact = this.waiting(state, id)
    // The Brain gets its copy first, so a failed delete never loses anyone.
    state.brain[id] = { contact, decision: { kind: 'let_go', at: this.now().toISOString() } }
    await this.store.save(state)
    await this.source.remove(id)
    return { id, decision: 'let_go', progress: await this.count(state) }
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
  const person = ({ contact, decision }: BrainEntry) => [
    `### ${contact.name}`,
    '',
    ...(decision.kind === 'kept' ? [`- Grateful for: ${decision.gratitude}${decision.spoken ? ' (spoken)' : ''}`] : []),
    `- ${decision.kind === 'kept' ? 'Kept' : 'Let go'} on ${day(decision.at)}`,
    ...(contact.organisation ? [`- Organisation: ${contact.organisation}`] : []),
    ...(contact.emails.length ? [`- Email: ${contact.emails.join(', ')}`] : []),
    ...(contact.phones.length ? [`- Phone: ${contact.phones.join(', ')}`] : []),
    '',
  ]
  const section = (title: string, kind: Decision['kind']) => {
    const people = sorted.filter((entry) => entry.decision.kind === kind)
    return people.length ? [`## ${title}`, '', ...people.flatMap(person)] : []
  }
  if (!sorted.length) return '# Brain\n\nNobody here yet.\n'
  return ['# Brain', '', ...section('Kept, with thanks', 'kept'), ...section('Let go', 'let_go')].join('\n').trimEnd() + '\n'
}
