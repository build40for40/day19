import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          GOOGLE_CLIENT_ID: "fake-client-id",
          GOOGLE_CLIENT_SECRET: "fake-client-secret",
          MCP_RESOURCE: "https://example.com/mcp",
        },
      },
    }),
  ],
});
