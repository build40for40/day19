# Day 19

Day 19 of [40 for 40](https://build40for40.com): a Claude and ChatGPT plugin that deals you 5 contacts a day. Say what you're grateful for to keep someone, or let them go.

## What's here

| Folder | What it is |
| --- | --- |
| `workers/mcp` | The one Worker: the MCP server and its keep or let go widget, Google sign-in, and each person's Brain |
| `workers/mcp/landing/` | Ben's landing page, served at `/` |

## Run it on your laptop

You need Node 24 and pnpm (`npm install -g pnpm`, or `npx pnpm@12.6.0` for each command).

1. Install everything from the repo root:

   ```bash
   pnpm install
   ```

2. Copy the example secrets and fill in the Google client ID and secret from the Google Cloud console (Google Auth Platform → Clients):

   ```bash
   cp workers/mcp/.dev.vars.example workers/mcp/.dev.vars
   ```

   The Google client needs `http://localhost:8788/callback` as an authorised redirect URI, and your Google account must be a test user.

3. Start the Worker:

   ```bash
   pnpm dev
   ```

4. Connect with MCP Inspector, point it at `http://localhost:8788/mcp`, sign in with Google and run `start_game` or `list_contacts`:

   ```bash
   npx @modelcontextprotocol/inspector
   ```

### No Google client yet?

The demo needs no sign-in. With `pnpm dev` running, point MCP Inspector at `http://localhost:8788/demo/mcp`, or run the local stand-in for Claude, which shows the widget:

```bash
pnpm --filter @day19/mcp host
```

Or play the widget on its own in a browser tab, with no server at all:

```bash
pnpm --filter @day19/mcp widget
```

## Deploy

Merging to `main` deploys through CI, once the repo has the `CLOUDFLARE_API_TOKEN`, `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` secrets. To deploy by hand instead: the first deploy creates the KV namespace for sign-in state, so set the two Google secrets once, then deploy:

```bash
pnpm --filter @day19/mcp wrangler secret put GOOGLE_CLIENT_ID
```

```bash
pnpm --filter @day19/mcp wrangler secret put GOOGLE_CLIENT_SECRET
```

```bash
pnpm --filter @day19/mcp deploy
```

Then add `https://gobbler.build40for40.com/callback` to the Google client's redirect URIs, and `https://gobbler.build40for40.com/mcp` as a custom connector in Claude or ChatGPT. `https://gobbler.build40for40.com/demo/mcp` is the demo, with no sign-in. `build40for40.com/gobbler` and `day19.40for40.workers.dev` redirect to the same place.

## Checks

```bash
pnpm typecheck
```

```bash
pnpm test
```
