# Day 19

Day 19 of 40 for 40, built live on Twitch on Thursday 26 November 2026. The problem is "Gratitude stays unsaid", from a submitter shown on the site as "The". Work is tracked on the Superthread `day19` board and the "Day 19" page.

- **Form factor:** a Claude and ChatGPT plugin (MCP).
- **Name:** TBC. The repo stays `day19` until the app has a name, then it's renamed and served at `build40for40.com/<app>/`.
- **Layout:** a pnpm monorepo. `workers/mcp` is the MCP server (a Cloudflare Worker), served at `https://day19-mcp.40for40.workers.dev/mcp` until the app has a name. The landing page and the widget go in `apps/`. Setup and commands are in `README.md`.
- **JavaScript and TypeScript dependencies:** pnpm, as one workspace. Run `pnpm install` from the root and `pnpm --filter @day19/mcp add <dep>` to add one. Never npm or yarn, and never a `package-lock.json`.

Shared 40 for 40 context lives in `../AGENTS.md`.

## The problem

Gratitude stays unsaid

We live in the most connected time in the history of the world and yet we live in the loneliest at the same time.

Each year, we only have give ourselves one dedicated day to tell our family and friends what we are grateful for. And what about our extended champions, maybe that teacher that nudged you, that parent of a childhood friend that said one line, or a guest lecture that said one phrase that changed the course of your life. Everyone has those people and everyone feels that grateful feeling, but right now it’s locked inside our hearts.

We don’t need to solve for everything, everywhere, and all at once, but the world could be a better place if we each could just find a way to let those people know how grateful we already feel about them.

Happy Thanksgiving team 🦃

## What we're building

A "hot or not" game for your contacts, played inside a Claude chat. One contact at a time, you either keep them, by saying a word of gratitude or saving something about them, or let them go.

- The user installs the plugin and signs in with Google (OAuth), giving read and write access to contacts through the Google People API.
- Contacts are archived to a database on a Cloudflare Worker first (the "brain"), so nothing is lost.
- Claude shows a widget in the chat with keep, let go and "give me more context about this person". Kept contacts are saved with what was written. Let go removes the contact from Google Contacts.
- Nothing is sent to anyone. Recording the gratitude is the point.
- A landing page explains it and how to install it.

Stretch: an archive middle option, sending the gratitude (message, email, letter), email frequency to suggest who to keep, scheduled runs, a phone app.

## How this repo works

- **Sign-in:** `@cloudflare/workers-oauth-provider` makes the Worker an OAuth server for Claude and ChatGPT (`/authorize`, `/oauth/token`, `/oauth/register`). Our `/authorize` page asks the user to approve the app, then hands them to Google; Google returns to `/callback`. The Google tokens live in the grant's encrypted `props`, never with Claude. When Claude refreshes our token, `tokenExchangeCallback` refreshes Google's.
- **The brain:** one `Brain` Durable Object per Google account (`idFromName(googleSub)`), with its own SQLite tables `contacts` and `meta`. It holds every contact, what the user decided, gratitude, notes, and a full snapshot taken before a contact can be deleted.
- **Sync:** the first sync reads every contact (about 2 People API calls for 1,500). After that the stored sync token fetches only changes; when Google says it's expired, we do a full read again. Tools sync on their own if the last sync was over 5 minutes ago.
- **The daily hand:** 5 contacts, 3 least-recently-edited plus the 2 highest scores from cheap signals (starred, family or friends, user labels, birthday, photo, notes, shared surname). Scoring and dealing are pure functions in `workers/mcp/src/score.ts`.
- **Tools today:** `sync_contacts`, `list_contacts`, `next_contacts`, `progress`. `keep_contact` and `let_go_contact` come next.
- **Tests never reach Google.** They run in the Workers runtime through `@cloudflare/vitest-plugin`, next to their source as `*.test.ts`.

## Decided

- Durable Object per user for the brain, not D1.
- Ask Google for `contacts` (read and write) from the start, so nobody has to re-consent when deletes land.
- Hand of 3 oldest plus 2 likely-meaningful; after 5 decided in a day, nudge but allow more.
- Keep appends a dated block to the contact's Google Notes and never overwrites. Let go archives a full snapshot, then really deletes.

## Still open

- How strict the gratitude box is.
- An undo for let go, restoring from the snapshot.
