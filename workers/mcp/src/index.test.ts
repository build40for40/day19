import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const call = (path: string, init?: RequestInit) => exports.default.fetch(`https://example.com${path}`, init);

describe("worker", () => {
  it("refuses /mcp without a token and points to the sign-in metadata", async () => {
    const response = await call("/mcp", { method: "POST" });
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain("resource_metadata");
  });

  it("publishes OAuth discovery so Claude and ChatGPT can find /authorize", async () => {
    const response = await call("/.well-known/oauth-authorization-server");
    expect(response.status).toBe(200);
    const meta = (await response.json()) as Record<string, unknown>;
    expect(meta.authorization_endpoint).toBe("https://example.com/authorize");
    expect(meta.registration_endpoint).toBe("https://example.com/oauth/register");
  });

  it("plays the demo on /demo/mcp without signing in", async () => {
    const rpc = (method: string, params: Record<string, unknown> = {}, id = 1) =>
      call("/demo/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      });
    const json = async (response: Response) => {
      const body = await response.text();
      const data = body.startsWith("{") ? body : body.split("\n").find((line) => line.startsWith("data:"))!.slice(5);
      return JSON.parse(data);
    };

    const tools = await json(await rpc("tools/list"));
    const names = tools.result.tools.map((tool: { name: string }) => tool.name);
    expect(names).toEqual(expect.arrayContaining(["start_game", "next_contacts", "keep_contact", "let_go_contact", "thank_you_notes", "reset_demo"]));
    expect(names).not.toContain("list_contacts");
    for (const tool of tools.result.tools) expect(tool._meta.securitySchemes).toEqual([{ type: "noauth" }]);

    const started = await json(await rpc("tools/call", { name: "reset_demo", arguments: {} }, 2));
    expect(started.result.structuredContent.contacts).toHaveLength(5);
    expect(started.result.structuredContent.contacts[0].name).toBe("Agnes Okafor");

    // Finishing the round tells the assistant to draft, and each kept contact is drafted once.
    const five = started.result.structuredContent.contacts as { id: string }[];
    let last;
    for (const [i, c] of five.entries()) last = await json(await rpc("tools/call", { name: "keep_contact", arguments: { id: c.id, gratitude: "teaching me mah jong" } }, 10 + i));
    expect(last.result.content.map((part: { text: string }) => part.text).join(" ")).toContain("thank_you_notes");
    const notes = await json(await rpc("tools/call", { name: "thank_you_notes", arguments: {} }, 20));
    expect(notes.result.structuredContent.notes).toHaveLength(5);
    expect(notes.result.content[0].text).toContain("I kept you.");
    const again = await json(await rpc("tools/call", { name: "thank_you_notes", arguments: {} }, 21));
    expect(again.result.structuredContent.notes).toHaveLength(0);

    // Starting today over puts the same five back, undecided.
    expect(names).toContain("start_over_today");
    const over = await json(await rpc("tools/call", { name: "start_over_today", arguments: {} }, 30));
    expect(over.result.content[0].text).toContain("5 kept contacts are undecided again");
    expect(over.result.structuredContent.contacts.map((c: { id: string }) => c.id)).toEqual(five.map((c) => c.id));
    expect(over.result.structuredContent.progress.decided).toBe(0);
  });

  it("serves a plain home page and 404s the rest", async () => {
    expect((await call("/")).status).toBe(200);
    expect((await call("/nope")).status).toBe(404);
  });

  it("serves Ben's landing page from landing/ at /", async () => {
    const home = await call("/");
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("Gobbler");
  });

  it("serves the turkey favicon, and links it from the landing page and the Worker's own pages", async () => {
    const types = { "/favicon.ico": "image/vnd.microsoft.icon", "/turkey.svg": "image/svg+xml", "/apple-touch-icon.png": "image/png" };
    for (const [path, type] of Object.entries(types)) {
      const icon = await call(path);
      expect(icon.status).toBe(200);
      expect(icon.headers.get("Content-Type")).toBe(type);
    }
    for (const path of ["/", "/privacy"]) {
      const html = await (await call(path)).text();
      expect(html).toContain('<link rel="icon" type="image/svg+xml" href="turkey.svg">');
      expect(html).toContain('<link rel="icon" href="favicon.ico" sizes="32x32">');
    }
  });

  it("serves the same site at build40for40.com/gobbler/, and sends the app's routes to the app's own host", async () => {
    const fetchAt = (url: string) => exports.default.fetch(url, { redirect: "manual" });
    expect(await (await fetchAt("https://build40for40.com/gobbler/")).text()).toBe(await (await call("/")).text());
    expect((await fetchAt("https://build40for40.com/gobbler/widget-keep.png")).status).toBe(200);
    expect(await (await fetchAt("https://build40for40.com/gobbler/privacy")).text()).toContain("Google API Services User Data Policy");
    expect((await fetchAt("https://build40for40.com/gobbler?x=1")).headers.get("Location")).toBe("https://build40for40.com/gobbler/?x=1");
    const mcp = await fetchAt("https://build40for40.com/gobbler/mcp?x=1");
    expect(mcp.status).toBe(301);
    expect(mcp.headers.get("Location")).toBe("https://example.com/mcp?x=1");
    expect((await fetchAt("https://day19.40for40.workers.dev/mcp")).headers.get("Location")).toBe("https://example.com/mcp");
    // Other paths on the main site aren't ours, and the app's own host is never redirected.
    expect((await fetchAt("https://build40for40.com/gobblers")).status).not.toBe(301);
    expect((await call("/privacy")).status).toBe(200);
  });

  it("serves the privacy policy Google links to, and the home page links it", async () => {
    const privacy = await call("/privacy");
    expect(privacy.status).toBe(200);
    const text = await privacy.text();
    expect(text).toContain("Google API Services User Data Policy");
    expect(text).toContain("hello@40for40.app");
    expect(await (await call("/")).text()).toContain('href="privacy"');
  });
});
