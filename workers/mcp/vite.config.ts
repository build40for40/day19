import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// The widget builds to one self-contained file, dist/widget.html, which the Worker serves as the MCP App resource.
export default defineConfig({
  root: 'widget',
  plugins: [viteSingleFile()],
  build: { outDir: '../dist', emptyOutDir: true, rollupOptions: { input: 'widget/widget.html' } },
})
