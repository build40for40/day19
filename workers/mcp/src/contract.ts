/**
 * The shared contract between the widget and the MCP server, from the "Day 19 - plan & brief" page.
 * Change it on that page first, then here. No imports, so the widget can use it without pulling in server code.
 */

export interface Contact {
  id: string
  name: string
  emails: string[]
  phones: string[]
  photoUrl: string | null
  organisation: string
}

export interface Progress {
  /** Contacts kept or let go so far, across every day. */
  decided: number
  /** Every contact, decided or not. */
  total: number
}

/** What `start_game` and `next_contacts` return. */
export interface Batch {
  /** Up to `limit` of today's contacts still to decide: new ones first, then kept people back for fresh thanks. */
  contacts: Contact[]
  progress: Progress
  /** True once today's contacts are all decided. The next ones come tomorrow, or now with `more`. */
  doneForToday: boolean
  /** How many kept people could be thanked again right now with `more`, even with nobody new left to sort. */
  thankAgain?: number
  /** For contacts in this batch who were kept before: what they were last thanked for, and when. */
  thankedBefore?: Record<string, { gratitude: string; at: string }>
}

/**
 * What happened to the thank-you draft when someone was kept, signed in only:
 * saved in their Gmail drafts, skipped for want of an email address, waiting on the person to
 * sign in again with Gmail drafts allowed, or failed.
 */
export type DraftStatus = 'saved' | 'no_email' | 'needs_permission' | 'failed'

/** What `keep_contact` and `let_go_contact` return. */
export interface Decided {
  id: string
  decision: 'kept' | 'let_go'
  progress: Progress
  /** Keeps only, signed in only. Missing in the demo. */
  draft?: DraftStatus
}

export const TOOL = {
  /** Opens the widget. No arguments. Returns a Batch. */
  start: 'start_game',
  /** `{ limit?: 1 to 5, more?: boolean }`. Returns a Batch. `more` deals five more once today's are all decided. */
  next: 'next_contacts',
  /** `{ id, gratitude }`. Returns Decided. */
  keep: 'keep_contact',
  /** `{ id }`. Returns Decided. */
  letGo: 'let_go_contact',
  /** No arguments. Returns Progress. */
  progress: 'progress',
} as const

export const BATCH_SIZE = 5
export const MIN_GRATITUDE = 3
export const MAX_GRATITUDE = 280
