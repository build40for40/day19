// The Brain: one Durable Object per person.
//
// Two kinds share this class:
// - A signed-in Brain, named after the person's Google id. It keeps a copy of their Google Contacts
//   in SQLite, syncs it, and plays the game on it: let go really deletes from Google, after a snapshot.
// - The demo Brain (DEMO_USER), on made-up contacts, with no sign-in. Samira's original game.
//
// The rules of the game (five a day, keep with gratitude or let go, the Brain as markdown) live in
// game.ts and are the same for both. Only where contacts come from, and how today's five are picked, differ.

import { DurableObject } from 'cloudflare:workers'

import { DEMO_CONTACTS, type ContactSource } from './contacts'
import type { Batch, Contact, Decided, Progress } from './contract'
import { Game, GameError, type GameState, type Pick, type StateStore, type ThankYou } from './game'
import { deleteContact, getPeople, listConnections, SyncTokenExpiredError } from './google'
import { dealHand, indexContact, type IndexedContact } from './score'

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

export type Status = 'new' | 'kept' | 'let_go' | 'gone'

/** One contact as the signed-in Brain holds it: the shared Contact, plus what we know and decided. */
export interface ContactRow extends Contact {
  updatedAt: string
  score: number
  signals: string[]
  status: Status
  gratitude: string | null
  notes: string | null
  decidedAt: string | null
  hasSnapshot: boolean
}

export interface SyncResult {
  mode: 'full' | 'incremental'
  changed: number
  total: number
}

/** Don't ask Google again if we synced this recently. */
const SYNC_FRESH_MS = 5 * 60 * 1000

export class Brain extends DurableObject<Env> {
  private readonly sql = this.ctx.storage.sql

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    this.migrate()
  }

  private migrate() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        resource_name TEXT PRIMARY KEY,
        etag          TEXT NOT NULL,
        display_name  TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        emails        TEXT NOT NULL DEFAULT '[]',
        phones        TEXT NOT NULL DEFAULT '[]',
        photo_url     TEXT,
        organisation  TEXT NOT NULL DEFAULT '',
        score         INTEGER NOT NULL DEFAULT 0,
        signals       TEXT NOT NULL DEFAULT '[]',
        status        TEXT NOT NULL DEFAULT 'new',
        gratitude     TEXT,
        notes         TEXT,
        snapshot      TEXT,
        decided_at    TEXT
      );
      CREATE INDEX IF NOT EXISTS contacts_status ON contacts (status);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `)
  }

  // ---------- small helpers ----------

  private getMeta(key: string): string | null {
    return this.sql.exec<{ value: string }>('SELECT value FROM meta WHERE key = ?', key).toArray()[0]?.value ?? null
  }

  private setMeta(key: string, value: string) {
    this.sql.exec('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value)
  }

  /** Signed in with Google, as opposed to the demo Brain. */
  private get signedIn(): boolean {
    return this.getMeta('user_id') !== null
  }

  private toRow(r: Record<string, SqlStorageValue>): ContactRow {
    return {
      id: r.resource_name as string,
      name: r.display_name as string,
      emails: JSON.parse(r.emails as string),
      phones: JSON.parse(r.phones as string),
      photoUrl: r.photo_url as string | null,
      organisation: r.organisation as string,
      updatedAt: r.updated_at as string,
      score: r.score as number,
      signals: JSON.parse(r.signals as string),
      status: r.status as Status,
      gratitude: r.gratitude as string | null,
      notes: r.notes as string | null,
      decidedAt: r.decided_at as string | null,
      hasSnapshot: r.snapshot !== null,
    }
  }

  private upsert(c: IndexedContact) {
    // Only Google's own fields are refreshed. Status, gratitude, notes and the snapshot are ours.
    this.sql.exec(
      `INSERT INTO contacts (resource_name, etag, display_name, updated_at, emails, phones, photo_url, organisation, score, signals)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (resource_name) DO UPDATE SET
         etag = excluded.etag, display_name = excluded.display_name, updated_at = excluded.updated_at,
         emails = excluded.emails, phones = excluded.phones, photo_url = excluded.photo_url,
         organisation = excluded.organisation, score = excluded.score, signals = excluded.signals,
         status = CASE WHEN contacts.status = 'gone' THEN 'new' ELSE contacts.status END`,
      c.resourceName, c.etag, c.displayName, c.updatedAt, JSON.stringify(c.emails), JSON.stringify(c.phones),
      c.photoUrl, c.organisation, c.score, JSON.stringify(c.signals),
    )
  }

  /** Someone deleted outside the game drops out. Anyone already decided keeps their history. */
  private markGone(resourceName: string) {
    this.sql.exec("UPDATE contacts SET status = 'gone' WHERE resource_name = ? AND status = 'new'", resourceName)
  }

  // ---------- the game, wired to the right contacts ----------

  private readonly store: StateStore = {
    load: () => this.ctx.storage.get<GameState>('state'),
    save: (state) => this.ctx.storage.put('state', state),
  }

  /** Samira's demo: made-up contacts kept in storage, so let go removes them for real. */
  private readonly demoSource: ContactSource = {
    list: async () => (await this.ctx.storage.get<Contact[]>('contacts')) ?? DEMO_CONTACTS,
    remove: async (id) => {
      const contacts = (await this.ctx.storage.get<Contact[]>('contacts')) ?? DEMO_CONTACTS
      await this.ctx.storage.put('contacts', contacts.filter((contact) => contact.id !== id))
    },
  }

  /** Google Contacts, through the copy in SQLite. Let go snapshots first, then deletes from Google. */
  private googleSource(accessToken: string): ContactSource {
    return {
      list: async () =>
        this.sql
          .exec("SELECT * FROM contacts WHERE status NOT IN ('gone', 'let_go')")
          .toArray()
          .map((r) => {
            // Just the shared Contact: this is what the game stores and the widget sees.
            const { id, name, emails, phones, photoUrl, organisation } = this.toRow(r)
            return { id, name, emails, phones, photoUrl, organisation }
          }),
      remove: async (id) => {
        const row = this.sql.exec<{ snapshot: string | null }>('SELECT snapshot FROM contacts WHERE resource_name = ?', id).toArray()[0]
        if (!row?.snapshot) {
          const [person] = await getPeople(accessToken, [id])
          if (person) this.sql.exec('UPDATE contacts SET snapshot = ? WHERE resource_name = ?', JSON.stringify(person), id)
        }
        await deleteContact(accessToken, id)
        this.sql.exec("UPDATE contacts SET status = 'let_go', decided_at = ? WHERE resource_name = ?", new Date().toISOString(), id)
      },
    }
  }

  /** Today's five for a signed-in person: 3 oldest-edited plus 2 most likely to matter (score.ts). */
  private readonly pickHand: Pick = (undecided) => {
    const known = new Map(
      this.sql
        .exec<{ resource_name: string; updated_at: string; score: number }>('SELECT resource_name, updated_at, score FROM contacts')
        .toArray()
        .map((r) => [r.resource_name, r]),
    )
    const cards = undecided.map((contact) => ({
      contact,
      resourceName: contact.id,
      displayName: contact.name,
      updatedAt: known.get(contact.id)?.updated_at ?? '1970-01-01T00:00:00Z',
      score: known.get(contact.id)?.score ?? 0,
    }))
    return dealHand(cards).map((card) => card.contact)
  }

  /**
   * The game for this Brain. A signed-in Brain needs the person's Google token, and syncs first,
   * so today's five are picked from an up-to-date address book.
   */
  private async game(accessToken?: string): Promise<Game> {
    if (!this.signedIn) return new Game(this.demoSource, this.store)
    if (!accessToken) throw new Error('A signed-in Brain needs a Google token')
    await this.sync(accessToken)
    return new Game(this.googleSource(accessToken), this.store, undefined, this.pickHand)
  }

  // ---------- called by the Worker over RPC ----------

  /** Who this Brain belongs to. Set at sign-in, and what makes it a signed-in Brain. */
  setProfile(profile: { userId: string; email: string; familyName: string }) {
    this.setMeta('user_id', profile.userId)
    this.setMeta('email', profile.email)
    this.setMeta('family_name', profile.familyName)
  }

  async next(limit?: number, more?: boolean, accessToken?: string): Promise<Batch> {
    return (await this.game(accessToken)).next(limit, more)
  }

  async progress(accessToken?: string): Promise<Progress> {
    return (await this.game(accessToken)).progress()
  }

  async keep(id: string, gratitude: string, accessToken?: string): Promise<Outcome<Decided>> {
    const game = await this.game(accessToken)
    const result = await outcome(() => game.keep(id, gratitude))
    if (result.ok && this.signedIn) {
      const saved = (await this.store.load())?.brain[id]?.decision
      this.sql.exec(
        "UPDATE contacts SET status = 'kept', gratitude = ?, decided_at = ? WHERE resource_name = ?",
        saved?.kind === 'kept' ? saved.gratitude : gratitude.trim(),
        new Date().toISOString(),
        id,
      )
    }
    return result
  }

  async letGo(id: string, accessToken?: string): Promise<Outcome<Decided>> {
    const game = await this.game(accessToken)
    return outcome(() => game.letGo(id))
  }

  async markdown(accessToken?: string): Promise<string> {
    return (await this.game(accessToken)).brain()
  }

  async thankYous(id?: string, accessToken?: string): Promise<ThankYou[]> {
    return (await this.game(accessToken)).thankYous(id)
  }

  /** Demo only: puts every made-up contact back and empties the Brain. Never wipes a signed-in Brain. */
  async reset(): Promise<Outcome<Batch>> {
    if (this.signedIn) return { ok: false, error: 'Only the demo can be reset.' }
    await this.ctx.storage.deleteAll()
    this.migrate()
    return { ok: true, value: await (await this.game()).next() }
  }

  /**
   * Brings the copy up to date with Google.
   * First time (or when the sync token has expired): reads every contact, about 2 calls for 1,500.
   * After that: only what changed since the last sync.
   */
  async sync(accessToken: string, options: { force?: boolean } = {}): Promise<SyncResult> {
    const lastSync = Number(this.getMeta('last_sync_ms') ?? 0)
    const syncToken = this.getMeta('sync_token')
    if (!options.force && syncToken && Date.now() - lastSync < SYNC_FRESH_MS) {
      return { mode: 'incremental', changed: 0, total: this.count() }
    }

    const familyName = this.getMeta('family_name') ?? ''
    let mode: SyncResult['mode'] = syncToken ? 'incremental' : 'full'
    let result: Awaited<ReturnType<typeof listConnections>>
    try {
      result = await listConnections(accessToken, syncToken ?? undefined)
    } catch (error) {
      if (!(error instanceof SyncTokenExpiredError)) throw error
      mode = 'full'
      result = await listConnections(accessToken)
    }

    this.ctx.storage.transactionSync(() => {
      const seen = new Set<string>()
      for (const person of result.people) {
        if (person.metadata?.deleted) {
          this.markGone(person.resourceName)
          continue
        }
        seen.add(person.resourceName)
        this.upsert(indexContact(person, familyName))
      }
      if (mode === 'full') {
        // Anyone we hold who wasn't in a full read has been deleted in Google.
        const held = this.sql.exec<{ resource_name: string }>("SELECT resource_name FROM contacts WHERE status = 'new'").toArray()
        for (const { resource_name } of held) if (!seen.has(resource_name)) this.markGone(resource_name)
      }
      if (result.syncToken) this.setMeta('sync_token', result.syncToken)
      this.setMeta('last_sync_ms', String(Date.now()))
    })

    return { mode, changed: result.people.length, total: this.count() }
  }

  /** Contacts still in Google. */
  count(): number {
    return this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM contacts WHERE status NOT IN ('gone', 'let_go')").one().n
  }

  /** The address book as the Brain sees it, A to Z, with what was decided. */
  listContacts(options: { status?: Exclude<Status, 'gone'>; search?: string; limit?: number; offset?: number } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
    const offset = Math.max(options.offset ?? 0, 0)
    const where: string[] = ["status != 'gone'"]
    const params: SqlStorageValue[] = []
    if (options.status) {
      where.push('status = ?')
      params.push(options.status)
    }
    if (options.search) {
      where.push('(display_name LIKE ? OR emails LIKE ? OR organisation LIKE ?)')
      const like = `%${options.search}%`
      params.push(like, like, like)
    }
    const clause = where.join(' AND ')
    const total = this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM contacts WHERE ${clause}`, ...params).one().n
    const contacts = this.sql
      .exec(`SELECT * FROM contacts WHERE ${clause} ORDER BY display_name COLLATE NOCASE LIMIT ? OFFSET ?`, ...params, limit, offset)
      .toArray()
      .map((r) => this.toRow(r))
    return { total, offset, contacts }
  }
}
