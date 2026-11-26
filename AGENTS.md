# Day 19

Day 19 of 40 for 40, built live on Twitch on Thursday 26 November 2026. The problem is "Gratitude stays unsaid", from a submitter shown on the site as "The". Work is tracked on the Superthread `day19` board and the "Day 19" page.

- **Form factor:** a Claude and ChatGPT plugin (MCP).
- **Name:** TBC. The repo stays `day19` until the app has a name, then it's renamed and served at `build40for40.com/<app>/`.

Shared 40 for 40 context lives in `../AGENTS.md`.

## Stack

- One Cloudflare Worker (`src/index.ts`) serving an MCP server at `/mcp`, built with `@modelcontextprotocol/server` and `agents/mcp/server`, like Day 15.
- The widget is an MCP App (`@modelcontextprotocol/ext-apps`): `widget/` builds with Vite into one file, `dist/widget.html`, which the Worker bundles as text and serves as the `ui://day19/contacts.html` resource. It renders in Claude and ChatGPT.
- `src/game.ts` holds the rules (five a day, delete or keep with gratitude, the Brain as markdown) with no Cloudflare in it, so it tests in plain Node.
- `src/brain.ts` is a Durable Object, one per person, that stores their decisions and today's five.
- `src/contacts.ts` has the `ContactSource` interface and the made-up demo contacts. **Google sign-in and the People API aren't built yet**: implement `ContactSource` for Google and give each signed-in person their own Brain (`DEMO_USER` in `src/env.ts` is the one shared Brain until then).

## Tools

- `todays_contacts`: opens the widget with today's five.
- `keep_contact` and `delete_contact`: used by the widget's buttons, and by the assistant when the person decides out loud. That's the dependable voice route.
- `read_brain`: the Brain as markdown.
- `reset_demo`: demo only, puts the made-up contacts back.

The widget also has a Speak button (the browser's speech to text). It asks the host for the microphone, and falls back to typing where the host says no.

## Commands

- `npm run dev`: builds the widget and runs the Worker at http://localhost:8799.
- `npm run host`: a small stand-in for Claude at http://localhost:5199 that shows the widget and talks to the dev Worker. Run it alongside `npm run dev`. Rebuild with `npm run build:widget` after changing the widget.
- `npm test`, `npm run typecheck`, `npm run build` (the widget build must run before typecheck and tests on a fresh clone, since the Worker imports `dist/widget.html`).
- `npm run deploy`, and wrangler as `npm run wrangler -- <args>`, never `npx wrangler`.

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
