import { BATCH_SIZE, MAX_GRATITUDE, TOOL, type Batch, type Decided, type Progress } from '../contract'

export const SERVER_NAME = 'day19'


export const SERVER_INSTRUCTIONS = `This server is a daily game for cleaning up a contacts list with gratitude. Each day it surfaces ${BATCH_SIZE} contacts. Each one is either let go, or kept by saying what the person is grateful to them for. Everything is saved to the person's Brain, a markdown file, so nobody is ever lost.

- Start with ${TOOL.start}. It shows a widget where the person decides by tapping and typing, so don't repeat the contacts in your reply.
- The person can also decide by talking to you. When they say they want to keep someone and why, call ${TOOL.keep} with their own words as the gratitude, tidied only for filler and false starts. Set spoken to true when they are using voice.
- Never write the gratitude for them, and never keep a contact without it. If they want to keep someone but haven't said why, ask what they're grateful to that person for.
- Only call ${TOOL.letGo} when the person clearly says to let go of or delete that contact. It deletes the contact from their contacts list and from any phone synced to it. A copy stays in the Brain.
- After deciding by talking, call ${TOOL.start} again if they want to see where they are.
- Nothing is ever sent to the contacts themselves.`

export const TEXT = {
  start: {
    title: 'Start the game',
    description: `Opens the keep or let go widget with today's ${BATCH_SIZE} contacts. Call this to start, or to show what is left today.`,
  },
  next: {
    title: 'Next contacts',
    description: `Returns up to ${BATCH_SIZE} of today's contacts that haven't been decided yet. When signed in with Google, today's ${BATCH_SIZE} are the 3 contacts edited longest ago plus the 2 most likely to matter (starred, family, birthday, photo...), so there's someone to thank. In the demo they're A to Z. No widget. The widget calls this to refresh.`,
    limit: `How many to return, 1 to ${BATCH_SIZE}. Defaults to ${BATCH_SIZE}.`,
  },
  keep: {
    title: 'Keep a contact, with gratitude',
    description: "Keeps one of today's contacts and saves what the person is grateful to them for into the Brain. The gratitude must be the person's own words and can't be empty.",
    id: "The contact's id, from start_game or next_contacts.",
    gratitude: `What the person is grateful to this contact for, in their own words. Up to ${MAX_GRATITUDE} characters.`,
    spoken: 'True when the person said it out loud rather than typing it.',
  },
  letGo: {
    title: 'Let a contact go',
    description: "Saves one of today's contacts to the Brain, then deletes it from the contacts list.",
    id: "The contact's id, from start_game or next_contacts.",
  },
  progress: {
    title: 'Progress',
    description: 'Returns how many contacts have been decided so far, out of how many there are.',
  },
  transcribe: {
    title: 'Speech to text',
    description: "Turns a short voice recording from the widget's Speak button into text. Only the widget uses this.",
    audio: 'The recording, base64 encoded.',
    mimeType: 'The recording\'s type, like audio/webm.',
  },
  brain: {
    title: 'Read the Brain',
    description: 'Returns the Brain as markdown: everyone kept, with what the person is grateful for, and everyone let go.',
  },
  reset: {
    title: 'Reset the demo',
    description: 'Demo only. Puts every made-up contact back and empties the Brain.',
  },
  sync: {
    title: 'Sync contacts',
    description:
      "Brings the person's saved copy of their Google Contacts up to date. The first sync reads every contact; after that only changes are fetched. The other tools sync by themselves, so only call this when the person asks or says they just changed their contacts.",
    force: 'Sync even if the last sync was under 5 minutes ago.',
  },
  list: {
    title: 'List contacts',
    description:
      "Lists the person's Google contacts from their saved copy, A to Z, with what they've decided about each (new, kept, let_go) and the gratitude for anyone kept. Use search to find someone by name, email or company.",
    status: 'Only contacts with this status.',
    search: 'Part of a name, email or company.',
    limit: 'How many to return, 1 to 200. Defaults to 50.',
    offset: 'How many to skip, for the next page.',
  },
} as const

export const SYNC_TOOL = 'sync_contacts'
export const LIST_TOOL = 'list_contacts'

export const BRAIN_TOOL = 'read_brain'
export const RESET_TOOL = 'reset_demo'

const progressText = ({ decided, total }: Progress) => `${decided} of ${total} contacts decided so far.`

/** What the model reads. The widget reads the structured version of the same thing. */
export function batchText({ contacts, progress, doneForToday }: Batch): string {
  if (doneForToday) return `That's today's contacts done. More tomorrow. ${progressText(progress)}`
  const lines = contacts.map((contact) => `- ${contact.name} (id ${contact.id}${contact.organisation ? `, ${contact.organisation}` : ''})`)
  return [`${contacts.length} still to decide today. ${progressText(progress)}`, ...lines].join('\n')
}

export const decidedText = ({ decision, progress }: Decided) =>
  `${decision === 'kept' ? 'Kept, and the gratitude is saved in the Brain.' : 'Let go. A copy is in the Brain.'} ${progressText(progress)}`

export { progressText }
