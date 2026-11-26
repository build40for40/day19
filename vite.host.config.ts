import { defineConfig } from 'vite'

// The local stand-in for Claude: http://localhost:5199, talking to `npm run dev` on port 8799.
export default defineConfig({
  root: 'dev',
  server: { port: 5199, strictPort: true, proxy: { '/mcp': 'http://localhost:8799' } },
})
