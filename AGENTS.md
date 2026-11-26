# Day 19

Day 19 of 40 for 40, built live on Twitch on Thursday 26 November 2026. The problem is "Gratitude stays unsaid", from a submitter shown on the site as "The". Work is tracked on the Superthread `day19` board and the "Day 19" page.

- **Form factor:** a Claude and ChatGPT plugin (MCP).
- **Name:** Gobbler. It lives at `https://gobbler.build40for40.com` (a Worker custom domain, like Day 13's `dumpling`), because sign-in tokens are bound to one host and OAuth discovery needs that host's root. `build40for40.com/gobbler` and the old `day19.40for40.workers.dev` redirect there (`src/hosts.ts`). The repo and the Worker are still called `day19`.
- **Layout:** a pnpm monorepo. `workers/mcp` is the one Worker: the MCP server, its widget, Google sign-in and each person's Brain, served at `https://gobbler.build40for40.com`. Ben's landing page is `workers/mcp/landing/index.html`, served at `/` as the Worker's static assets, with any CSS and images next to it. The Worker runs first, so don't add files there named `mcp`, `authorize`, `callback`, `privacy` or `oauth`. `/privacy` is the privacy policy Google's consent screen links to (`src/privacy.ts`). Setup and commands are in `README.md`. Paths below are inside `workers/mcp`.
- **JavaScript and TypeScript dependencies:** pnpm, as one workspace. Run `pnpm install` from the root and `pnpm --filter @day19/mcp add <dep>` to add one. Never npm or yarn, and never a `package-lock.json`.

Shared 40 for 40 context lives in `../AGENTS.md`.

## Stack

- One Cloudflare Worker (`src/index.ts`) serving the MCP server, built with `@modelcontextprotocol/server` and `agents/mcp/server`, like Day 15. `/mcp` needs Google sign-in and plays on the person's own contacts. `/demo/mcp` is the same server on made-up contacts with no sign-in.
- The widget is an MCP App (`@modelcontextprotocol/ext-apps`): `widget/` builds with Vite into one file, `dist/widget.html`, which the Worker bundles as text and serves as a `ui://day19/contacts-<hash>.html` resource (the hash changes with each build, so chat apps don't show a stale copy). It renders in Claude and ChatGPT.
- `src/contract.ts` is the shared contract below as TypeScript types and tool names. The widget and the server both import it. `src/mcp/schemas.ts` is the same thing as zod schemas.
- `src/game.ts` holds the rules (five a day, let go or keep with gratitude, the Brain as markdown) with no Cloudflare in it, so it tests in plain Node and also runs inside the widget's fake mode.
- `src/brain.ts` is a Durable Object, one per person, that stores their decisions and today's five, and for a signed-in person their copy of Google Contacts.
- `src/contacts.ts` has the `ContactSource` interface and the made-up demo contacts. `src/google.ts` is everything that talks to Google, and `src/score.ts` picks a signed-in person's five.

## The contract

From "The shared contract (tools)" on the Superthread "Day 19 - plan & brief" page. Change it there first, then in `src/contract.ts`.

A contact is `{ id, name, emails[], phones[], photoUrl, organisation }`. `photoUrl` is `null` when there's no photo, and `organisation` is `""` when there's none.

| Tool | Arguments | Returns (`structuredContent`) |
| --- | --- | --- |
| `start_game` | none | `{ contacts[], progress, doneForToday }`, and opens the widget |
| `next_contacts` | `{ limit? }`, 1 to 5, default 5 | `{ contacts[], progress, doneForToday }` |
| `keep_contact` | `{ id, gratitude }` | `{ id, decision: "kept", progress }` |
| `let_go_contact` | `{ id }` | `{ id, decision: "let_go", progress }` |
| `progress` | none | `{ decided, total }` |

What the widget relies on, beyond the names:

- **`contacts`** are today's undecided contacts, at most `limit`: A to Z in the demo, 3 oldest plus 2 likely-meaningful when signed in. `start_game` returns the same thing as `next_contacts` with no arguments, so the widget draws from the tool result and needs no second call.
- **`progress`** comes back with every result, so the "12 of 340 decided" line never needs its own call. `total` counts everyone, including people already let go.
- **`doneForToday`** is true once today's five are all decided. The server owns the five a day rule: it picks the five once per UK day and `next_contacts` only ever returns what's left of them.
- **Errors** come back as a normal tool result with `isError: true` and one plain-English sentence as text, which the widget shows as it is ("Say what you're grateful to Bao for first."). No `structuredContent` on an error.
- **Text for the assistant**: every result also has a `content` text version of the same data, because the assistant reads that and the widget reads `structuredContent`.
- Deciding the same contact twice is an error. The widget then calls `next_contacts` and skips anyone already decided, which is how a contact kept by telling the assistant drops out of the widget.

Extra tools sit outside the contract: `read_brain` (the Brain as markdown), `reset_demo` (demo endpoint only, puts the made-up contacts back), and `sync_contacts` and `list_contacts` (signed in only).

### Two ways to give the gratitude

- **Typing it in the widget's box.**
- **Telling the assistant in the chat**: the person says "keep her, she told me my writing was worth reading" and the assistant calls `keep_contact` with their words. The server instructions tell it never to write the gratitude itself.

There is no voice input. The widget had a Speak button that recorded a clip and sent it to a `transcribe` tool (Cloudflare's Whisper model), and it was taken out on Day 19: the Claude desktop app wouldn't give the widget the microphone, and where it did, the clip hung on its way to the server. The `spoken` flag on `keep_contact` went with it.

### What MCP and MCP Apps need, and where it's met

- **The widget is a resource**: a `ui://` address, MIME type `text/html;profile=mcp-app`, one self-contained HTML file with no outside scripts.
- **One tool opens it**: `start_game` has `_meta.ui.resourceUri` pointing at it. The other tools have no widget, so the assistant can call them without drawing a new one each time.
- **Every tool declares `inputSchema` and `outputSchema`**, and its `structuredContent` matches the output schema.
- **Annotations**: `readOnlyHint` on the three that only read, `destructiveHint` on `let_go_contact` so chat apps ask before the assistant deletes anyone.
- **CSP lives on the resource**, not the tool: `csp.resourceDomains` allows `https://lh3.googleusercontent.com`, where Google serves contact photos. Check that host against real People API photo URLs once sign-in works.
- **The widget talks through the `App` class** only: `ontoolresult` for the first batch, `callServerTool` for the buttons, `updateModelContext` to tell the assistant what was decided, and the host's theme and fonts.
- **OAuth on `/mcp`**: done. `/demo/mcp` stays open to anyone with the address.

## Commands

Run these from `workers/mcp` (or from the root with `pnpm --filter @day19/mcp <script>`).

- `pnpm dev`: builds the widget and runs the Worker at http://localhost:8788. Google sign-in needs `.dev.vars` (see `README.md`); the demo at `/demo/mcp` doesn't.
- `pnpm host`: a small stand-in for Claude at http://localhost:5199 that shows the widget and plays the demo against the dev Worker. Run it alongside `pnpm dev`. Rebuild with `pnpm build:widget` after changing the widget.
- `pnpm widget`: the widget on its own in a browser tab, in fake mode (`?fake=1`), with made-up contacts and no server. Changes show up as you save.
- `pnpm test`, `pnpm typecheck`, `pnpm build`. `test` and `build` build the widget first, since the Worker imports `dist/widget.html`.
- `pnpm deploy`, and wrangler as `pnpm wrangler <args>`, never `npx wrangler`.

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
  1. **Delete the contact** ("let go" in the widget). It gets deleted from the Google Contacts list, but it is stored in the "Brain" (a markdown file) first.
  2. **Keep the contact.** To keep it I have to fill out a short text box saying what I'm grateful for. The contact stays in Google Contacts, and the gratitude is saved into the Brain with the contact.
- The gratitude is typed into the box, or told to the assistant in the chat. Voice input was dropped on Day 19.

## What we're building

A "hot or not" game for your contacts, played inside a Claude chat, as a Claude and ChatGPT plugin (MCP).

- The user installs the plugin and signs in with Google (OAuth), giving read and write access to contacts through the Google People API.
- Claude shows a widget in the chat with the day's 5 contacts, one at a time, each with delete and keep.
- The Brain is the archive: every contact that leaves Google is written there first, and every kept contact is written there with its gratitude.
- Nothing is sent to anyone. Recording the gratitude is the point.
- A landing page explains it and how to install it.

Stretch: an archive middle option, sending the gratitude (message, email, letter), email frequency to suggest who to keep, scheduled runs, a phone app.

## Sign-in, sync and the signed-in Brain

- **Sign-in:** `@cloudflare/workers-oauth-provider` makes the Worker an OAuth server for Claude and ChatGPT (`/authorize`, `/oauth/token`, `/oauth/register`). Our `/authorize` page (`src/auth.ts`) asks the person to approve the app, then hands them to Google; Google returns to `/callback`. The Google tokens live in the grant's encrypted `props`, never with Claude. When Claude refreshes our token, `tokenExchangeCallback` in `src/index.ts` refreshes Google's.
- **One Brain class, two kinds:** a signed-in person gets a Brain named after their Google id (`idFromName(sub)`); the demo endpoint uses one shared Brain (`DEMO_USER`). Both play the same `Game`. A signed-in Brain also keeps a copy of the person's Google Contacts in SQLite (tables `contacts` and `meta`), and its `ContactSource` reads from that copy and deletes from Google.
- **Sync:** the first sync reads every contact (about 2 People API calls for 1,500). After that the stored sync token fetches only changes; when Google says it's expired, it does a full read again. Every game call syncs first if the last sync was over 5 minutes ago.
- **Today's five, signed in:** 3 contacts edited longest ago plus the 2 highest scores from cheap signals (starred, family or friends, user labels, birthday, photo, notes, shared surname), from `src/score.ts`. The game takes a `pick` function for this; the demo and the widget's fake mode keep A to Z.
- **Let go, signed in:** the game writes the Brain entry first, then the Google source saves a full snapshot of the contact (every field the People API has) and deletes it from Google. A contact already gone from Google counts as deleted.
- **Two more tools when signed in:** `sync_contacts` and `list_contacts` (the whole address book from the copy, A to Z, with each status and gratitude). `reset_demo` only exists on the demo endpoint.
- **Tests never reach Google or Cloudflare.** They run in the Workers runtime through `@cloudflare/vitest-plugin` with remote bindings off, next to their source as `*.test.ts`.

## Decided

- Durable Object per person for the Brain, not D1.
- Ask Google for `contacts` (read and write) from the start, so nobody has to re-consent when deletes land.
- Signed in, today's five are 3 oldest plus 2 likely-meaningful.
- Let go archives a full snapshot, then really deletes.

## Still open

- Lawrence decided that after five a day the game nudges but allows more, and the game today stops at five (`doneForToday`) until tomorrow. Pick one.
- Lawrence decided keep also appends a dated block to the contact's Google Notes, never overwriting. Not built yet: today the gratitude is saved in the Brain only.
- How strict the gratitude box is (today: at least 3 characters).
- An undo for let go, restoring from the snapshot.
- `/demo/mcp` is open to anyone with the address.

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
