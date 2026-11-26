// The tools Claude and ChatGPT can call. Each request builds a fresh server: all state
// lives in the user's brain (a Durable Object), so nothing here needs to survive.

import { McpServer } from "@modelcontextprotocol/server";
import { getMcpAuthContext } from "agents/mcp/server";
import { env } from "cloudflare:workers";
import { z } from "zod";
import type { Brain, ContactRow } from "./brain";
import { GoogleRevokedError, type GoogleProps } from "./google";
import { HAND } from "./score";

const DAILY_TARGET = HAND.oldest + HAND.meaningful;

function currentUser(): GoogleProps {
  const props = getMcpAuthContext()?.props as GoogleProps | undefined;
  if (!props?.userId) throw new Error("Not signed in");
  return props;
}

function brainFor(user: GoogleProps): DurableObjectStub<Brain> {
  return env.BRAIN.get(env.BRAIN.idFromName(user.userId));
}

/** What a contact looks like to Claude and the widget. Matches the contract on the plan page. */
function publicContact(c: ContactRow) {
  return {
    id: c.resourceName,
    name: c.displayName,
    email: c.email,
    phone: c.phone,
    photoUrl: c.photoUrl,
    organisation: c.organisation,
    lastEdited: c.updatedAt,
    status: c.status,
    whySurfaced: c.signals,
    gratitude: c.gratitude,
    notes: c.notes,
  };
}

function reply(data: Record<string, unknown>, text?: string) {
  return {
    content: [{ type: "text" as const, text: text ? `${text}\n\n${JSON.stringify(data, null, 2)}` : JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

/** Turns Google sign-in failures into a message the user can act on. */
async function guarded<T>(run: () => Promise<T>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof GoogleRevokedError) {
      return {
        content: [{ type: "text" as const, text: "Google sign-in has expired or was removed. Disconnect and reconnect this app to sign in with Google again." }],
        isError: true,
      };
    }
    throw error;
  }
}

export function createServer() {
  const server = new McpServer({ name: "day19", version: "0.1.0" });

  server.registerTool(
    "sync_contacts",
    {
      title: "Sync contacts",
      description:
        "Bring the user's saved copy of their Google Contacts up to date. The first sync reads every contact; after that only changes are fetched. Other tools sync on their own, so call this only when the user asks or says they just changed contacts.",
      inputSchema: z.object({
        force: z.boolean().optional().describe("Sync even if the last sync was under 5 minutes ago."),
      }),
    },
    ({ force }) =>
      guarded(async () => {
        const user = currentUser();
        const result = await brainFor(user).sync(user.accessToken, { force });
        return reply({ ...result }, `Synced (${result.mode}): ${result.changed} changed, ${result.total} contacts in Google.`);
      }),
  );

  server.registerTool(
    "list_contacts",
    {
      title: "List contacts",
      description:
        "List the user's contacts from their saved copy, A to Z, with what they've decided about each (new, shown, kept, let_go) and any gratitude or notes. Use search to find someone by name, email or company.",
      inputSchema: z.object({
        status: z.enum(["new", "shown", "kept", "let_go"]).optional().describe("Only contacts with this status."),
        search: z.string().optional().describe("Part of a name, email or company."),
        limit: z.number().int().min(1).max(200).optional().describe("How many to return (default 50, max 200)."),
        offset: z.number().int().min(0).optional().describe("How many to skip, for the next page."),
      }),
    },
    (args) =>
      guarded(async () => {
        const user = currentUser();
        const brain = brainFor(user);
        await brain.sync(user.accessToken);
        const result = await brain.listContacts(args);
        const next = result.offset + result.contacts.length;
        return reply(
          { total: result.total, offset: result.offset, nextOffset: next < result.total ? next : null, contacts: result.contacts.map(publicContact) },
          `Showing ${result.contacts.length} of ${result.total} contacts.`,
        );
      }),
  );

  server.registerTool(
    "next_contacts",
    {
      title: "Today's 5 contacts",
      description:
        "Deal today's hand of 5 contacts to decide on: 3 the user hasn't touched in the longest time (likely to let go) and 2 who probably matter (starred, family, birthday, photo...), so there's someone to thank. An unfinished hand is returned again rather than dealing a new one. For each, the user either keeps them by saying what they're grateful for, or lets them go. Present them one at a time, warmly.",
      inputSchema: z.object({}),
    },
    () =>
      guarded(async () => {
        const user = currentUser();
        const brain = brainFor(user);
        await brain.sync(user.accessToken);
        const { hand, dealtNew, progress } = await brain.nextHand(user.accessToken);

        let message: string;
        if (hand.length === 0) message = "Every contact has been decided on. The address book is clean 🦃";
        else if (!dealtNew) message = "Here's the hand still in progress.";
        else if (progress.decidedToday >= DAILY_TARGET)
          message = `That's your ${DAILY_TARGET} for today 🦃 Here's another hand, since you asked.`;
        else message = `Today's hand: ${hand.length} people.`;

        return reply({ contacts: hand.map(publicContact), progress }, message);
      }),
  );

  server.registerTool(
    "progress",
    {
      title: "Progress",
      description: "How far through their address book the user is: total, decided, kept, let go and decided today.",
      inputSchema: z.object({}),
    },
    () =>
      guarded(async () => {
        const user = currentUser();
        const progress = await brainFor(user).progress();
        return reply({ ...progress });
      }),
  );

  return server;
}
