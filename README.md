# Day 19

Day 19 of [40 for 40](https://build40for40.com): a Claude and ChatGPT plugin that deals you 5 contacts a day. Say what you're grateful for to keep someone, or let them go.

## What's here

| Folder | What it is |
| --- | --- |
| `workers/mcp` | The MCP server on Cloudflare Workers: Google sign-in, the contacts brain, and the tools |
| `apps/` | Coming: the landing page and the keep or let go widget |

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

4. Connect with MCP Inspector, point it at `http://localhost:8788/mcp`, sign in with Google and run `progress` or `next_contacts`:

   ```bash
   npx @modelcontextprotocol/inspector
   ```

## Deploy

The first deploy creates the KV namespace for sign-in state. Set the two Google secrets once, then deploy:

```bash
pnpm --filter @day19/mcp wrangler secret put GOOGLE_CLIENT_ID
```

```bash
pnpm --filter @day19/mcp wrangler secret put GOOGLE_CLIENT_SECRET
```

```bash
pnpm --filter @day19/mcp deploy
```

Then add `https://day19-mcp.40for40.workers.dev/callback` to the Google client's redirect URIs, and `https://day19-mcp.40for40.workers.dev/mcp` as a custom connector in Claude or ChatGPT.

## Checks

```bash
pnpm typecheck
```

```bash
pnpm test
```
