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
  /** Up to `limit` contacts nobody has decided on yet, A to Z. */
  contacts: Contact[]
  progress: Progress
  /** True once today's contacts are all decided. The next ones come tomorrow. */
  doneForToday: boolean
}

/** What `keep_contact` and `let_go_contact` return. */
export interface Decided {
  id: string
  decision: 'kept' | 'let_go'
  progress: Progress
}

export const TOOL = {
  /** Opens the widget. No arguments. Returns a Batch. */
  start: 'start_game',
  /** `{ limit?: 1 to 5 }`. Returns a Batch. */
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
