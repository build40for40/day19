// Turns a line of gratitude into a short thank-you email, to save as a Gmail draft.
// Claude rewrites the person's own note into one to three warm sentences addressed to the contact,
// adding nothing they didn't say. If that fails for any reason, a plain template uses their words
// as written, so a keep always gets its draft.

import Anthropic from '@anthropic-ai/sdk'

import { THANKS_PS } from './mcp/text'

export interface ThankYouInput {
  /** The contact's full name, as in their Google contact. */
  contactName: string
  /** What the person said they're grateful for, often a rough note about the contact ("he always bought me a beer"). */
  gratitude: string
  /** The signed-in person's name, for the sign-off. */
  senderName: string
}

export interface ThankYouEmail {
  subject: string
  body: string
  /** True when Claude wrote the sentences, false when the template did. */
  polished: boolean
}

const SUBJECT = 'Thank you'
const MAX_SENTENCES_CHARS = 600

const SYSTEM = `You turn a short, rough note of gratitude into the middle of a thank-you email, written by the person who wrote the note, to the person the note is about.

Rules:
- One to three plain sentences. Warm and natural, never gushing.
- First person, speaking directly to the recipient as "you". Notes are often written about them ("he always bought me a beer"); turn that into "Thank you for always buying me a beer."
- Rephrase rough notes into proper sentences, but add no facts, memories, feelings, places or details that aren't in the note.
- No greeting, no sign-off, no subject line, no P.S. Just the sentences.
- If the note is a joke or a placeholder, keep it light and short rather than inventing meaning.`

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name.trim()

/** The full email around the middle sentences: greeting, sentences, sign-off and the Gobbler P.S. */
export function assemble(sentences: string, { contactName, senderName }: ThankYouInput): string {
  const signOff = senderName.trim() ? firstName(senderName) : ''
  return [`Hi ${firstName(contactName)},`, '', sentences.trim(), '', signOff ? `Thanks,\n${signOff}` : 'Thanks', '', THANKS_PS].join('\n')
}

/** The fallback: the person's own words, quoted as they wrote them. */
export function templateSentences({ gratitude }: ThankYouInput): string {
  const note = gratitude.trim().replace(/\s+/g, ' ')
  return `I've been going through my contacts and wanted to tell you why I kept you: ${note}${/[.!?]$/.test(note) ? '' : '.'}`
}

async function polish(apiKey: string, input: ThankYouInput): Promise<string | null> {
  const client = new Anthropic({ apiKey, timeout: 15_000, maxRetries: 1 })
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Recipient's first name: ${firstName(input.contactName)}\nNote of gratitude: ${input.gratitude.trim()}`,
      },
    ],
  })
  if (response.stop_reason === 'refusal') return null
  const text = response.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join(' ')
    .trim()
  if (!text || text.length > MAX_SENTENCES_CHARS) return null
  return text
}

/** Writes the thank-you. Never throws: any trouble with Claude falls back to the template. */
export async function writeThankYou(apiKey: string | undefined, input: ThankYouInput): Promise<ThankYouEmail> {
  if (apiKey) {
    try {
      const sentences = await polish(apiKey, input)
      if (sentences) return { subject: SUBJECT, body: assemble(sentences, input), polished: true }
    } catch (error) {
      console.warn('thank-you polish failed, using the template', error instanceof Error ? error.message : error)
    }
  }
  return { subject: SUBJECT, body: assemble(templateSentences(input), input), polished: false }
}
