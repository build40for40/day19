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
    expect(names).toEqual(expect.arrayContaining(["start_game", "next_contacts", "keep_contact", "let_go_contact", "reset_demo"]));
    expect(names).not.toContain("list_contacts");

    const started = await json(await rpc("tools/call", { name: "reset_demo", arguments: {} }, 2));
    expect(started.result.structuredContent.contacts).toHaveLength(5);
    expect(started.result.structuredContent.contacts[0].name).toBe("Agnes Okafor");
  });

  it("serves a plain home page and 404s the rest", async () => {
    expect((await call("/")).status).toBe(200);
    expect((await call("/nope")).status).toBe(404);
  });
});
