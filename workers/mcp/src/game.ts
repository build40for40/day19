import type { ContactSource } from './contacts'
import { BATCH_SIZE, MAX_GRATITUDE, MIN_GRATITUDE, type Batch, type Contact, type Decided, type Progress } from './contract'

export type Decision = { kind: 'kept'; gratitude: string; at: string } | { kind: 'let_go'; at: string }

/** One person in the Brain: the contact as it was, and what was decided about them. */
export interface BrainEntry {
  contact: Contact
  decision: Decision
  /** When a thank-you draft was last made or handed out for this contact, so nobody gets drafted twice. */
  drafted?: string
  /** The Gmail draft Gobbler saved itself when this contact was last kept. */
  draftId?: string
  /** Every earlier time this person was thanked, oldest first. Kept people come back round, so thanks pile up. */
  earlier?: { gratitude: string; at: string }[]
}


export interface GameState {
  /** The UK date today's contacts were picked for, as YYYY-MM-DD. */
  date?: string
  /** Today's contacts: five picked at the start of the day, topped up if it started short, plus any extra rounds asked for. */
  today: Contact[]
  brain: Record<string, BrainEntry>
}

export interface StateStore {
  load(): Promise<GameState | undefined>
  save(state: GameState): Promise<void>
}

export class GameError extends Error {}

const ukDate = (now: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now)

/** Picks today's contacts from everyone undecided. The game takes the first BATCH_SIZE of what it returns. */
export type Pick = (undecided: Contact[]) => Contact[]

/** The default: A to Z. Signed-in Brains swap in the hand from score.ts. */
export const aToZ: Pick = (undecided) => undecided.toSorted((a, b) => a.name.localeCompare(b.name, 'en'))

/** The rules: five contacts a day, each let go or kept with gratitude, and everything written to the Brain. */
export class Game {
  constructor(
    private readonly source: ContactSource,
    private readonly store: StateStore,
    private readonly now: () => Date = () => new Date(),
    private readonly pick: Pick = aToZ,
  ) {}

  private async state(): Promise<GameState> {
    const state = (await this.store.load()) ?? { today: [], brain: {} }
    const date = ukDate(this.now())
    // A hand that started short (a new account, or contacts added during the day) is filled back up to five.
    if (state.date === date) return state.today.length < BATCH_SIZE ? this.deal(state, BATCH_SIZE - state.today.length) : state
    // A new day: the next five nobody has decided on yet, picked by `pick` (A to Z unless told otherwise),
    // then kept people back for fresh thanks, longest-ago thanks first.
    const next = { ...state, date, today: [] as Contact[] }
    next.today = this.candidates(next, await this.source.list()).slice(0, BATCH_SIZE)
    await this.store.save(next)
    return next
  }

  /**
   * Who could go into today's hand, best first: everyone nobody has decided on yet, picked by `pick`, then kept
   * people whose last thanks is oldest. Friendship doesn't lapse: a kept person can be thanked again any day
   * after the one they were last thanked on. Never anyone let go, and never anyone already in today's hand.
   */
  private candidates(state: GameState, contacts: Contact[]): Contact[] {
    const inHand = new Set(state.today.map((contact) => contact.id))
    const fresh = contacts.filter((contact) => !state.brain[contact.id] && !inHand.has(contact.id))
    const due = contacts
      .filter((contact) => state.brain[contact.id]?.decision.kind === 'kept' && !inHand.has(contact.id) && !this.decidedToday(state, contact.id))
      .toSorted((a, b) => state.brain[a.id]!.decision.at.localeCompare(state.brain[b.id]!.decision.at) || a.name.localeCompare(b.name, 'en'))
    return [...this.pick(fresh), ...due]
  }

  /** Decided since today's hand was dealt: kept or let go today (UK date). */
  private decidedToday(state: GameState, id: string): boolean {
    const decision = state.brain[id]?.decision
    return decision !== undefined && ukDate(new Date(decision.at)) === (state.date ?? ukDate(this.now()))
  }

  /** In today's hand and not yet decided today. A kept person back for fresh thanks counts as waiting. */
  private isWaiting(state: GameState, id: string): boolean {
    const decision = state.brain[id]?.decision
    return decision === undefined || (decision.kind === 'kept' && !this.decidedToday(state, id))
  }

  /** Adds up to `count` more contacts to today's hand. Everyone already in it stays, decided or not. */
  private async deal(state: GameState, count: number): Promise<GameState> {
    const pool = this.candidates(state, await this.source.list())
    if (!pool.length) return state
    const next = { ...state, today: [...state.today, ...pool.slice(0, count)] }
    await this.store.save(next)
    return next
  }

  /** Kept people who could be thanked again right now, for the widget's "thank more" button. */
  private async thankable(state: GameState): Promise<number> {
    return this.candidates(state, await this.source.list()).filter((contact) => state.brain[contact.id]?.decision.kind === 'kept').length
  }

  private async count(state: GameState): Promise<Progress> {
    const ids = new Set([...Object.keys(state.brain), ...(await this.source.list()).map((contact) => contact.id)])
    return { decided: Object.keys(state.brain).length, total: ids.size }
  }

  /**
   * What's left of today's hand. With `more`, and only once today's hand is all decided, five more are dealt:
   * the day's five is a habit, not a wall, so someone on a roll can go again as often as they like.
   */
  async next(limit = BATCH_SIZE, more = false): Promise<Batch> {
    let state = await this.state()
    const left = (from: GameState) => from.today.filter((contact) => this.isWaiting(from, contact.id))
    if (more && left(state).length === 0) state = await this.deal(state, BATCH_SIZE)
    const waiting = left(state).slice(0, limit)
    const thankedBefore = Object.fromEntries(
      waiting.flatMap((contact) => {
        const decision = state.brain[contact.id]?.decision
        return decision?.kind === 'kept' ? [[contact.id, { gratitude: decision.gratitude, at: decision.at }]] : []
      }),
    )
    return {
      contacts: waiting,
      progress: await this.count(state),
      doneForToday: waiting.length === 0,
      thankAgain: await this.thankable(state),
      ...(Object.keys(thankedBefore).length ? { thankedBefore } : {}),
    }
  }

  async progress(): Promise<Progress> {
    return this.count(await this.state())
  }

  private waiting(state: GameState, id: string): Contact {
    const contact = state.today.find((c) => c.id === id)
    if (!contact) throw new GameError(`No contact with id "${id}" in today's contacts.`)
    if (!this.isWaiting(state, id)) throw new GameError(`${contact.name} has already been decided.`)
    return contact
  }

  async keep(id: string, gratitude: string): Promise<Decided> {
    const state = await this.state()
    const contact = this.waiting(state, id)
    const text = gratitude.trim().replace(/\s+/g, ' ')
    if (text.length < MIN_GRATITUDE) throw new GameError(`Say what you're grateful to ${contact.name} for first.`)
    if (text.length > MAX_GRATITUDE) throw new GameError(`Keep it under ${MAX_GRATITUDE} characters.`)
    state.brain[id] = { contact, decision: { kind: 'kept', gratitude: text, at: this.now().toISOString() }, earlier: history(state.brain[id]) }
    await this.store.save(state)
    return { id, decision: 'kept', progress: await this.count(state) }
  }

  async letGo(id: string): Promise<Decided> {
    const state = await this.state()
    const contact = this.waiting(state, id)
    // The Brain gets its copy first, so a failed delete never loses anyone.
    state.brain[id] = { contact, decision: { kind: 'let_go', at: this.now().toISOString() }, earlier: history(state.brain[id]) }
    await this.store.save(state)
    await this.source.remove(id)
    return { id, decision: 'let_go', progress: await this.count(state) }
  }

  async brain(): Promise<string> {
    return brainMarkdown(Object.values((await this.state()).brain))
  }

  /**
   * Kept contacts to write thank-yous to, newest first: just `id` if given, everyone kept if `all`,
   * otherwise only those with no draft yet. Everyone returned is marked as drafted.
   */
  async thankYous({ id, all = false }: { id?: string; all?: boolean } = {}): Promise<ThankYou[]> {
    const state = await this.state()
    const notes = thankYous(Object.values(state.brain)).filter((note) => (id ? note.id === id : all || !state.brain[note.id]?.drafted))
    if (notes.length) {
      const at = this.now().toISOString()
      for (const note of notes) state.brain[note.id]!.drafted = at
      await this.store.save(state)
    }
    return notes
  }
}

/** Earlier thanks to carry forward when someone is decided again: past ones, plus the last keep. Undefined if none. */
function history(entry: BrainEntry | undefined): BrainEntry['earlier'] {
  if (!entry) return undefined
  const past = [...(entry.earlier ?? []), ...(entry.decision.kind === 'kept' ? [{ gratitude: entry.decision.gratitude, at: entry.decision.at }] : [])]
  return past.length ? past : undefined
}

/** What a thank-you email is written from. The assistant drafts it; nothing here sends anything. */
export interface ThankYou {
  id: string
  name: string
  emails: string[]
  gratitude: string
  keptOn: string
}

export function thankYous(entries: BrainEntry[]): ThankYou[] {
  return entries
    .flatMap(({ contact, decision }) =>
      decision.kind === 'kept'
        ? [{ id: contact.id, name: contact.name, emails: contact.emails, gratitude: decision.gratitude, keptOn: decision.at }]
        : [],
    )
    .toSorted((a, b) => b.keptOn.localeCompare(a.keptOn))
}

const day = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

/** The Brain as one markdown file: everyone kept with their gratitude, then everyone let go. */
export function brainMarkdown(entries: BrainEntry[]): string {
  const sorted = entries.toSorted((a, b) => a.contact.name.localeCompare(b.contact.name, 'en'))
  const person = ({ contact, decision, earlier }: BrainEntry) => [
    `### ${contact.name}`,
    '',
    ...(decision.kind === 'kept' ? [`- Grateful for: ${decision.gratitude}`] : []),
    ...(earlier ?? []).toReversed().map((thanks) => `- Earlier, on ${day(thanks.at)}: ${thanks.gratitude}`),
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
