import { BATCH_SIZE, MAX_GRATITUDE, TOOL, type Batch, type Decided, type DraftStatus, type Progress } from '../contract'

export const SERVER_NAME = 'gobbler'
export const THANKS_TOOL = 'thank_you_notes'

/** Ends every thank-you draft, word for word, unless the person asks to leave it out. */
export const THANKS_PS =
  "P.S. I'm finally clearing out my contacts with Gobbler, a Claude and ChatGPT plugin. Every day it shows me five people, and to keep one I have to say why. I kept you. Clean up yours at build40for40.com/gobbler"


/** How to turn kept contacts into thank-you drafts. In the server instructions, and in every thank_you_notes result, since some chat apps don't show the model server instructions. */
export const THANKS_BRIEF = `- Call ${THANKS_TOOL}. With no arguments it returns everyone kept who has no draft yet; with an id, just that person; with all, everyone kept. It returns each name, email and gratitude, and repeats these rules.
- Write one short email each, turning the gratitude into a simple, coherent thank-you: one to three plain sentences, warm and natural, in the first person, as if the person wrote it. Rephrase rough notes into proper sentences ("mah jong" becomes "teaching me mah jong"), but add no facts, memories or feelings they didn't give.
- Give each one a short subject line, like "Thank you" or "A quick thank you".
- End each email with this P.S., exactly as written, on its own line after the sign-off: "${THANKS_PS}" Leave it out only if the person asks. Tell them once that it's there and they can drop it.
- If an email tool such as Gmail is connected, save each one as a draft addressed to the contact. Never send it: the person reviews and sends it themselves. Without an email tool, show the drafts in the chat with a mailto link for each contact that has an email address.
- Skip anyone with no email address, and say who was skipped.`

export const SERVER_INSTRUCTIONS = `This is Gobbler, a daily gratitude game for the person's contacts list. Each day it surfaces ${BATCH_SIZE} contacts. Each one is either let go, or kept by saying what the person is grateful to them for. Everything is saved to the person's Brain, a markdown file, so nobody is ever lost.

Gobbler is not an inbox, email or calendar cleaner, and it never deletes in bulk. When someone signed in with Google keeps a contact, Gobbler itself saves a thank-you email to that contact in their Gmail drafts, straight away. It never sends anything. Don't draft those again yourself unless the person asks for a rewrite.

Starting the game: the person's way in is "Let's Gobble". Call ${TOOL.start} straight away for that and anything like it, typos included: "lets gobble", "let gobble", "lets gobbel", "lets gobbler", "I'd like to gobble now", "gobble my contacts", "time to gobble", "play Gobbler", "open Gobbler". Also call it when they ask to clean up or sort the people in their contacts while Gobbler is connected. Asking for thank-you emails to people already kept is different: that's ${THANKS_TOOL}. Don't ask them to confirm first.

- Start with ${TOOL.start}. It shows a widget where the person decides by tapping and typing, so don't repeat the contacts in your reply.
- The person can also decide by telling you in the chat. When they say they want to keep someone and why, call ${TOOL.keep} with their own words as the gratitude, tidied only for filler and false starts.
- Never write the gratitude for them, and never keep a contact without it. If they want to keep someone but haven't said why, ask what they're grateful to that person for.
- Only call ${TOOL.letGo} when the person clearly says to let go of or delete that contact. It deletes the contact from their contacts list and from any phone synced to it. A copy stays in the Brain.
- After deciding in the chat, call ${TOOL.start} again if they want to see where they are.
- Five a day is the habit, not a limit. When today's are done and the person asks for more ("five more", "keep going"), call ${TOOL.next} with more set to true, then ${TOOL.start}. Don't deal more unless they ask.
- This server never sends anything to the contacts themselves.

Thank-you emails. Signed in with Google, Gobbler saves one in Gmail drafts for each person as they're kept, and every ${TOOL.keep} result says whether it did. So don't write them yourself just because a round ended. Write them only when the person asks ("draft thank-yous", "rewrite the one to Jeff", "email the people I kept"), or in the demo, where nobody is signed in. Drafts are never sent, so there's nothing to confirm:
${THANKS_BRIEF}`

export const TEXT = {
  start: {
    title: "Gobbler: today's five",
    description: `Starts Gobbler, the daily gratitude game: opens the keep or let go widget with today's ${BATCH_SIZE} contacts. Call this when the person says "Let's Gobble" or anything like it, typos included ("lets gobble", "lets gobbel", "lets gobbler", "I'd like to gobble now", "gobble my contacts", "play Gobbler"), or asks to clean up or sort the people in their contacts. Also call it to show what is left today. Not for email or inbox clean-ups, and not for thank-you emails (that's ${THANKS_TOOL}).`,
  },
  next: {
    title: 'Next contacts',
    description: `Returns up to ${BATCH_SIZE} of today's contacts that haven't been decided yet. When signed in with Google, today's ${BATCH_SIZE} are the 3 contacts edited longest ago plus the 2 most likely to matter (starred, family, birthday, photo...), so there's someone to thank. In the demo they're A to Z. No widget. The widget calls this to refresh.`,
    limit: `How many to return, 1 to ${BATCH_SIZE}. Defaults to ${BATCH_SIZE}.`,
    more: `Deals ${BATCH_SIZE} more once today's contacts are all decided. Only set it when the person asks to keep going. It does nothing while any of today's are still waiting.`,
  },
  keep: {
    title: 'Keep a contact, with gratitude',
    description: "Keeps one of today's contacts and saves what the person is grateful to them for into the Brain. The gratitude must be the person's own words and can't be empty.",
    id: "The contact's id, from start_game or next_contacts.",
    gratitude: `What the person is grateful to this contact for, in their own words. Up to ${MAX_GRATITUDE} characters.`,
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
  brain: {
    title: 'Read the Brain',
    description: 'Returns the Brain as markdown: everyone kept, with what the person is grateful for, and everyone let go.',
  },
  thanks: {
    title: 'Thank-you notes',
    description:
      "Only when the person asks for thank-you emails or notes to the people they kept, or asks you to rewrite one. When signed in with Google, Gobbler already saves a Gmail draft for each person as they're kept, so don't call this just because a round ended. Returns everyone kept who has no draft yet, newest first (or one person with id, or everyone with all), with their email addresses and what the person is grateful to them for, plus the rules for writing the drafts. Then write each email and save it as a draft with the person's email tool (such as Gmail). Never send it.",
    id: 'Only this contact, drafted again even if it already has one.',
    all: 'Everyone kept, including those who already have a draft.',
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
  if (doneForToday) {
    const more = progress.total > progress.decided ? ` More tomorrow, or if they ask to keep going, call ${TOOL.next} with more set to true and then ${TOOL.start} to show them.` : ' Nobody is left to sort.'
    return `That's today's contacts done.${more} ${progressText(progress)}`
  }
  const lines = contacts.map((contact) => `- ${contact.name} (id ${contact.id}${contact.organisation ? `, ${contact.organisation}` : ''})`)
  return [`${contacts.length} still to decide today. ${progressText(progress)}`, ...lines].join('\n')
}

/** Added to a signed-in keep or let go result when it finishes the round. The drafts are already saved. */
export const ROUND_DONE = `That's today's contacts done. Gobbler saved a thank-you in their Gmail drafts for everyone kept with an email address, as each was kept. Tell them the drafts are waiting there, unsent. Don't draft them again unless they ask.`

const DRAFT_TEXT: Record<DraftStatus, string> = {
  saved: 'A thank-you to them is saved in their Gmail drafts, not sent.',
  no_email: 'No email address for this contact, so no thank-you draft.',
  needs_permission: 'No thank-you draft: the Google sign-in needs Gmail drafts allowed. Disconnect and reconnect Gobbler to allow it.',
  failed: "The thank-you draft didn't save this time.",
}

export const decidedText = ({ decision, progress, draft }: Decided) =>
  `${decision === 'kept' ? 'Kept, and the gratitude is saved in the Brain.' : 'Let go. A copy is in the Brain.'}${draft ? ` ${DRAFT_TEXT[draft]}` : ''} ${progressText(progress)}`

export { progressText }
