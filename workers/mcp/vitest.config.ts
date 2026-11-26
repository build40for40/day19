import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The first test in each file starts the Workers runtime, which can take over 5s on CI.
  test: { testTimeout: 20_000 },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // Tests never reach Cloudflare, so CI needs no login.
      remoteBindings: false,
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
