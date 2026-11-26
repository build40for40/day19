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
