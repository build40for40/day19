import { DAILY_COUNT, MAX_GRATITUDE, type Today } from '../game'

export const SERVER_NAME = 'day19'

export const WIDGET_URI = 'ui://day19/contacts.html'

export const SERVER_INSTRUCTIONS = `This server is a daily game for cleaning up a contacts list with gratitude. Each day it surfaces ${DAILY_COUNT} contacts. Each one is either deleted, or kept by saying what the person is grateful to them for. Everything is saved to the person's Brain, a markdown file, so nobody is ever lost.

- Start with todays_contacts. It shows a widget where the person can decide by tapping and typing, so don't repeat the list in your reply.
- The person can also decide by talking to you. When they say they want to keep someone and why, call keep_contact with their own words as the gratitude, tidied only for filler and false starts. Set spoken to true when they are using voice.
- Never write the gratitude for them, and never keep a contact without it. If they want to keep someone but haven't said why, ask what they're grateful to that person for.
- Only call delete_contact when the person clearly says to delete or let go of that contact. Deleting removes it from their contacts list. A copy stays in the Brain.
- Nothing is ever sent to the contacts themselves.`

export const TOOLS = {
  today: {
    name: 'todays_contacts',
    title: "Today's five contacts",
    description: `Shows today's ${DAILY_COUNT} contacts in a widget, each waiting to be deleted or kept with gratitude. Call this to start, or to see what is left today.`,
  },
  keep: {
    name: 'keep_contact',
    title: 'Keep a contact, with gratitude',
    description: `Keeps one of today's contacts and saves what the person is grateful to them for into the Brain. The gratitude must be the person's own words.`,
    contactId: "The contact's id, from todays_contacts.",
    gratitude: `What the person is grateful to this contact for, in their own words. Up to ${MAX_GRATITUDE} characters.`,
    spoken: 'True when the person said it out loud rather than typing it.',
  },
  delete: {
    name: 'delete_contact',
    title: 'Delete a contact',
    description: "Deletes one of today's contacts from the contacts list. A copy is saved to the Brain first.",
    contactId: "The contact's id, from todays_contacts.",
  },
  brain: {
    name: 'read_brain',
    title: 'Read the Brain',
    description: 'Returns the Brain as markdown: everyone kept, with what the person is grateful for, and everyone let go.',
  },
  reset: {
    name: 'reset_demo',
    title: 'Reset the demo',
    description: 'Demo only. Puts every made-up contact back and empties the Brain.',
  },
} as const

/** What the model reads. The widget reads the structured version of the same thing. */
export function todayText({ contacts, remaining }: Today): string {
  if (!contacts.length) return 'Nobody left to go through. Every contact has been decided.'
  const lines = contacts.map((contact) => {
    const status =
      contact.decision?.kind === 'kept'
        ? `kept, grateful for: ${contact.decision.gratitude}`
        : contact.decision?.kind === 'deleted'
          ? 'deleted'
          : 'waiting'
    return `- ${contact.name} (id ${contact.id}${contact.detail ? `, ${contact.detail}` : ''}): ${status}`
  })
  const summary = remaining ? `${remaining} of ${contacts.length} still to decide today.` : "That's today's five done. Five more tomorrow."
  return [summary, ...lines].join('\n')
}
