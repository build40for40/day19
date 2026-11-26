# Day 19

Day 19 of 40 for 40, built live on Twitch on Thursday 26 November 2026. The problem is "Gratitude stays unsaid", from a submitter shown on the site as "The". Work is tracked on the Superthread `day19` board and the "Day 19" page.

- **Form factor:** a Claude and ChatGPT plugin (MCP).
- **Name:** TBC. The repo stays `day19` until the app has a name, then it's renamed and served at `build40for40.com/<app>/`.

Shared 40 for 40 context lives in `../AGENTS.md`.

## The problem

Gratitude stays unsaid

We live in the most connected time in the history of the world and yet we live in the loneliest at the same time.

Each year, we only have give ourselves one dedicated day to tell our family and friends what we are grateful for. And what about our extended champions, maybe that teacher that nudged you, that parent of a childhood friend that said one line, or a guest lecture that said one phrase that changed the course of your life. Everyone has those people and everyone feels that grateful feeling, but right now it’s locked inside our hearts.

We don’t need to solve for everything, everywhere, and all at once, but the world could be a better place if we each could just find a way to let those people know how grateful we already feel about them.

Happy Thanksgiving team 🦃

## User story

Written by Samira on the day.

- As a user I get surfaced 5 contacts a day from my Google Contacts list.
- For each contact there are two options:
  1. **Delete the contact.** It gets deleted from the Google Contacts list, but it is stored in the "Brain" (a markdown file) first.
  2. **Keep the contact.** To keep it I have to fill out a short text box saying what I'm grateful for. The contact stays in Google Contacts, and the gratitude is saved into the Brain with the contact.
- The gratitude can be typed or spoken. Voice input fills the same box.

## What we're building

A "hot or not" game for your contacts, played inside a Claude chat, as a Claude and ChatGPT plugin (MCP).

- The user installs the plugin and signs in with Google (OAuth), giving read and write access to contacts through the Google People API.
- Claude shows a widget in the chat with the day's 5 contacts, one at a time, each with delete and keep.
- The Brain is the archive: every contact that leaves Google is written there first, and every kept contact is written there with its gratitude.
- Nothing is sent to anyone. Recording the gratitude is the point.
- A landing page explains it and how to install it.

Stretch: an archive middle option, sending the gratitude (message, email, letter), email frequency to suggest who to keep, scheduled runs, a phone app.

## More from the brief and plan

The rest of the team's planning call, from the Superthread "Day 19 - plan & brief" page. That page is the source. Where it clashes with the user story above, the user story wins, since it was written later.

The tagline idea: never forget anyone, but only remember who you care about. It's the thousand Facebook friends and nobody to feed your cat problem.

### Units of work

- **Auth:** register for Google API access and create the OAuth app.
- **Contacts:** the Google People API integration, reading and writing.
- **Widget:** a mini web app shown inside the chat, with a few sides to it, including "give me more context about this person".
- **Ordering:** the back-end logic for which contacts come up next. A to Z is fine for the MVP, even though names starting with odd characters come first.
- **Landing page:** install instructions, the explanation and the branding.
- **Plugin store:** submit eventually, since approval takes a while.

### Architecture notes

- It has to be a plugin because it writes back to Google.
- The first step is always a full archive of the contacts, before any game is played.
- The brief had the contacts dumped into a database on a Cloudflare Worker, with the AI talking to that database. The user story has the Brain as a markdown file. A CSV and Google Drive were floated too.
- A skill runs when the user chats: the hot or not game first, and later things like duplicate suggestions.
- Contacts and email are separate Google scopes. Contacts are the easy one, and reading email needs another scope.

### The Brain

- It's a copy of the contacts, not the only source of truth.
- Only the "hot" contacts sync back to the phone, so about 200 real ones instead of 1,500.
- Archived contacts are labelled so the AI doesn't pick them up when working with the user.
- A contact is never deleted from the phone until the user has made a decision on it.

### Contact sources

- Google Contacts only for the MVP, so it only works with a Google sign-in.
- Android contacts usually sync to Google already.
- iPhone users can sync contacts to a Google account both ways, or do a one-time export from iCloud. Removing a contact from Google should remove it from iCloud.

### Decisions

- Google for the MVP, and the MVP only needs the ability to say or record gratitude.
- Contact cleaning comes first. A phone app gets built only if demand is high.
- One person builds the widget inside the chat. Another takes auth and architecture, and can hand over if it gets too annoying.

### Open questions

- **Delete or keep on the phone:** one view was that contacts never leave the phone and the Brain stays a copy. The other was that the tool has to remove them while they live on in the Brain. The user story goes with removing them from Google.
- **Fake gratitude:** someone can type "NA" and save. How strict to be is undecided.
- **Trust:** whether people will hand this over, and what they gain by moving contacts out of Google into a file.
- **Phone numbers:** whether they can be read from Google contacts.
- **Value:** it's a lot of effort for the user and nobody on the team has done it. The counterpoint is clearing out junk (old Skype syncs, WhatsApp scams) and enriching the few who matter.

### More stretch goals

- A "gratitude champion" or "Grateful gobbler" badge for finishing the whole list.
- Gratitude questions in the widget, and drafts written from contacts and emails if Gmail is connected.
- Smarter ordering by name, like keeping people who share your last name and archiving gibberish.
- Checking whether email addresses still work. On email frequency, the counterpoint was that the people you care about most are the ones you never email.
- The phone app would be Android first, with call log, messages and favourites, working offline.
- A unified messaging API for SMS and WhatsApp that was recommended the day before.
- Money: a donate button, a membership, or free cleaning with a Pro phone app.
