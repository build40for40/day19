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

  it("serves a plain home page and 404s the rest", async () => {
    expect((await call("/")).status).toBe(200);
    expect((await call("/nope")).status).toBe(404);
  });
});
