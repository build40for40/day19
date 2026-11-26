import { defineConfig } from 'vite'

// The local stand-in for Claude: http://localhost:5199, talking to `pnpm dev` on port 8788.
// It plays the demo (made-up contacts, no sign-in), so /mcp here goes to the Worker's /demo/mcp.
export default defineConfig({
  root: 'dev',
  server: {
    port: 5199,
    strictPort: true,
    proxy: { '/mcp': { target: 'http://localhost:8788', rewrite: (path) => path.replace(/^\/mcp/, '/demo/mcp') } },
  },
})
