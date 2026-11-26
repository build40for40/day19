// The brain: one Durable Object per Google account, with its own SQLite database.
// It keeps a copy of every contact, what the user decided about each one, and the
// sync token that lets us ask Google for only what changed.

import { DurableObject } from "cloudflare:workers";
import { getPeople, listConnections, SyncTokenExpiredError } from "./google";
import { dealHand, indexContact, type IndexedContact } from "./score";

export type Status = "new" | "shown" | "kept" | "let_go" | "gone";

export interface ContactRow {
  resourceName: string;
  etag: string;
  displayName: string;
  updatedAt: string;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  organisation: string | null;
  score: number;
  signals: string[];
  status: Status;
  gratitude: string | null;
  notes: string | null;
  shownAt: string | null;
  decidedAt: string | null;
  hasSnapshot: boolean;
}

export interface SyncResult {
  mode: "full" | "incremental";
  changed: number;
  total: number;
}

/** Don't ask Google again if we synced this recently. */
const SYNC_FRESH_MS = 5 * 60 * 1000;

/** Today's date in London, e.g. "2026-11-26". The daily nudge resets at UK midnight. */
function londonToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

export class Brain extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS contacts (
        resource_name TEXT PRIMARY KEY,
        etag          TEXT NOT NULL,
        display_name  TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        email         TEXT,
        phone         TEXT,
        photo_url     TEXT,
        organisation  TEXT,
        score         INTEGER NOT NULL DEFAULT 0,
        signals       TEXT NOT NULL DEFAULT '[]',
        status        TEXT NOT NULL DEFAULT 'new',
        gratitude     TEXT,
        notes         TEXT,
        snapshot      TEXT,
        shown_at      TEXT,
        decided_at    TEXT
      );
      CREATE INDEX IF NOT EXISTS contacts_status_updated ON contacts (status, updated_at);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
  }

  // ---------- small helpers ----------

  private getMeta(key: string): string | null {
    const row = this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key).toArray()[0];
    return row?.value ?? null;
  }

  private setMeta(key: string, value: string) {
    this.sql.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", key, value);
  }

  private upsert(c: IndexedContact) {
    // Keeps status, gratitude, notes and snapshot: only Google's own fields are refreshed.
    this.sql.exec(
      `INSERT INTO contacts (resource_name, etag, display_name, updated_at, email, phone, photo_url, organisation, score, signals)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (resource_name) DO UPDATE SET
         etag = excluded.etag, display_name = excluded.display_name, updated_at = excluded.updated_at,
         email = excluded.email, phone = excluded.phone, photo_url = excluded.photo_url,
         organisation = excluded.organisation, score = excluded.score, signals = excluded.signals,
         status = CASE WHEN contacts.status = 'gone' THEN 'new' ELSE contacts.status END`,
      c.resourceName, c.etag, c.displayName, c.updatedAt, c.email, c.phone, c.photoUrl, c.organisation, c.score,
      JSON.stringify(c.signals),
    );
  }

  /** A contact that left Google outside our game drops out of the queue. Decided ones keep their history. */
  private markGone(resourceName: string) {
    this.sql.exec("UPDATE contacts SET status = 'gone' WHERE resource_name = ? AND status IN ('new', 'shown')", resourceName);
  }

  private toRow(r: Record<string, SqlStorageValue>): ContactRow {
    return {
      resourceName: r.resource_name as string,
      etag: r.etag as string,
      displayName: r.display_name as string,
      updatedAt: r.updated_at as string,
      email: r.email as string | null,
      phone: r.phone as string | null,
      photoUrl: r.photo_url as string | null,
      organisation: r.organisation as string | null,
      score: r.score as number,
      signals: JSON.parse(r.signals as string),
      status: r.status as Status,
      gratitude: r.gratitude as string | null,
      notes: r.notes as string | null,
      shownAt: r.shown_at as string | null,
      decidedAt: r.decided_at as string | null,
      hasSnapshot: r.snapshot !== null,
    };
  }

  // ---------- called by the Worker over RPC ----------

  /** Who this brain belongs to. Set at sign-in; the surname feeds the "shares your surname" signal. */
  setProfile(profile: { userId: string; email: string; familyName: string }) {
    this.setMeta("user_id", profile.userId);
    this.setMeta("email", profile.email);
    this.setMeta("family_name", profile.familyName);
  }

  /**
   * Brings the brain up to date with Google.
   * First time (or when the sync token has expired): reads every contact, about 2 calls for 1,500.
   * After that: only what changed since the last sync.
   */
  async sync(accessToken: string, options: { force?: boolean } = {}): Promise<SyncResult> {
    const lastSync = Number(this.getMeta("last_sync_ms") ?? 0);
    const syncToken = this.getMeta("sync_token");
    if (!options.force && syncToken && Date.now() - lastSync < SYNC_FRESH_MS) {
      return { mode: "incremental", changed: 0, total: this.count() };
    }

    const familyName = this.getMeta("family_name") ?? "";
    let mode: SyncResult["mode"] = syncToken ? "incremental" : "full";
    let result: Awaited<ReturnType<typeof listConnections>>;
    try {
      result = await listConnections(accessToken, syncToken ?? undefined);
    } catch (error) {
      if (!(error instanceof SyncTokenExpiredError)) throw error;
      mode = "full";
      result = await listConnections(accessToken);
    }

    this.ctx.storage.transactionSync(() => {
      const seen = new Set<string>();
      for (const person of result.people) {
        if (person.metadata?.deleted) {
          this.markGone(person.resourceName);
          continue;
        }
        seen.add(person.resourceName);
        this.upsert(indexContact(person, familyName));
      }
      if (mode === "full") {
        // Anyone we hold who wasn't in a full read has been deleted in Google.
        const held = this.sql.exec<{ resource_name: string }>("SELECT resource_name FROM contacts WHERE status IN ('new', 'shown')").toArray();
        for (const { resource_name } of held) if (!seen.has(resource_name)) this.markGone(resource_name);
      }
      if (result.syncToken) this.setMeta("sync_token", result.syncToken);
      this.setMeta("last_sync_ms", String(Date.now()));
    });

    return { mode, changed: result.people.length, total: this.count() };
  }

  /** Contacts still in Google (everything except "gone" and "let go"). */
  count(): number {
    return this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM contacts WHERE status NOT IN ('gone', 'let_go')").one().n;
  }

  /** The address book as the brain sees it, A to Z, optionally filtered. */
  listContacts(options: { status?: Status; search?: string; limit?: number; offset?: number } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const offset = Math.max(options.offset ?? 0, 0);
    const where: string[] = ["status != 'gone'"];
    const params: SqlStorageValue[] = [];
    if (options.status) {
      where.push("status = ?");
      params.push(options.status);
    }
    if (options.search) {
      where.push("(display_name LIKE ? OR email LIKE ? OR organisation LIKE ?)");
      const like = `%${options.search}%`;
      params.push(like, like, like);
    }
    const clause = where.join(" AND ");
    const total = this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM contacts WHERE ${clause}`, ...params).one().n;
    const rows = this.sql
      .exec(`SELECT * FROM contacts WHERE ${clause} ORDER BY display_name COLLATE NOCASE LIMIT ? OFFSET ?`, ...params, limit, offset)
      .toArray()
      .map((r) => this.toRow(r));
    return { total, offset, contacts: rows };
  }

  /**
   * Today's hand of 5: 3 oldest-edited plus the 2 most likely to matter.
   * An unfinished hand comes back as it was, so refreshing the chat doesn't skip anyone.
   * Every contact dealt gets its full snapshot saved first, so it can never be deleted unarchived.
   */
  async nextHand(accessToken: string) {
    const unfinished = this.sql.exec("SELECT * FROM contacts WHERE status = 'shown' ORDER BY shown_at, display_name").toArray();
    let hand = unfinished.map((r) => this.toRow(r));
    let dealtNew = false;

    if (hand.length === 0) {
      const undecided = this.sql.exec("SELECT * FROM contacts WHERE status = 'new'").toArray().map((r) => this.toRow(r));
      hand = dealHand(undecided);
      dealtNew = hand.length > 0;
    }

    // Snapshot anyone in the hand who doesn't have one yet (dealt now, or dealt before a crash).
    const needSnapshot = hand.filter((c) => !c.hasSnapshot).map((c) => c.resourceName);
    const snapshots = await getPeople(accessToken, needSnapshot);
    const now = new Date().toISOString();
    this.ctx.storage.transactionSync(() => {
      for (const person of snapshots) {
        this.sql.exec("UPDATE contacts SET snapshot = ?, etag = ? WHERE resource_name = ?", JSON.stringify(person), person.etag, person.resourceName);
      }
      if (dealtNew) {
        for (const c of hand) this.sql.exec("UPDATE contacts SET status = 'shown', shown_at = ? WHERE resource_name = ?", now, c.resourceName);
      }
    });

    const fresh = hand.map((c) => this.toRow(this.sql.exec("SELECT * FROM contacts WHERE resource_name = ?", c.resourceName).one()));
    return { hand: fresh, dealtNew, progress: this.progress() };
  }

  /** How far through the address book the user is, and how many they decided today. */
  progress() {
    const counts = Object.fromEntries(
      this.sql.exec<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM contacts GROUP BY status").toArray().map((r) => [r.status, r.n]),
    ) as Partial<Record<Status, number>>;
    const today = londonToday();
    const decidedToday = this.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM contacts WHERE status IN ('kept', 'let_go') AND decided_at >= ?", `${today}T00:00:00`)
      .one().n;
    const kept = counts.kept ?? 0;
    const letGo = counts.let_go ?? 0;
    return {
      total: kept + letGo + (counts.new ?? 0) + (counts.shown ?? 0),
      decided: kept + letGo,
      kept,
      letGo,
      decidedToday,
      lastSync: this.getMeta("last_sync_ms") ? new Date(Number(this.getMeta("last_sync_ms"))).toISOString() : null,
    };
  }
}
