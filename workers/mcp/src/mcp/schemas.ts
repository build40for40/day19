import { z } from 'zod'

import { BATCH_SIZE, MAX_GRATITUDE, type Batch, type Contact, type Decided, type Progress } from '../contract'
import type { ThankYou } from '../game'
import { TEXT } from './text'

// The contract in src/contract.ts as schemas, so every tool advertises its input and output shape.
export const contact = z.object({
  id: z.string(),
  name: z.string(),
  emails: z.array(z.string()),
  phones: z.array(z.string()),
  photoUrl: z.string().nullable(),
  organisation: z.string(),
}) satisfies z.ZodType<Contact>

export const progress = z.object({ decided: z.number().int(), total: z.number().int() }) satisfies z.ZodType<Progress>

export const batch = z.object({ contacts: z.array(contact), progress, doneForToday: z.boolean() }) satisfies z.ZodType<Batch>

export const decided = z.object({ id: z.string(), decision: z.enum(['kept', 'let_go']), progress }) satisfies z.ZodType<Decided>

export const nothing = z.object({})

export const nextInput = z.object({ limit: z.number().int().min(1).max(BATCH_SIZE).optional().describe(TEXT.next.limit) })

export const keepInput = z.object({
  id: z.string().describe(TEXT.keep.id),
  // Longer than the limit on purpose, so an over-long line gets the game's plain-English answer rather than a schema error.
  gratitude: z.string().max(MAX_GRATITUDE * 4).describe(TEXT.keep.gratitude),
})

export const letGoInput = z.object({ id: z.string().describe(TEXT.letGo.id) })

export const thanksInput = z.object({ id: z.string().optional().describe(TEXT.thanks.id) })

export const thanks = z.object({
  notes: z.array(z.object({ id: z.string(), name: z.string(), emails: z.array(z.string()), gratitude: z.string(), keptOn: z.string() })),
}) satisfies z.ZodType<{ notes: ThankYou[] }>
