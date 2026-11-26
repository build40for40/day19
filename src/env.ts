import type { Brain } from './brain'

export interface Env {
  BRAINS: DurableObjectNamespace<Brain>
  AI: Ai
}

/** Where the app lives on build40for40.com. workers.dev and local dev serve the same paths without it. */
export const BASE_PATH = '/gobbler'
export const MCP_PATH = '/mcp'
export const TRANSCRIBE_PATH = '/transcribe'

/** Everyone shares one made-up contacts list until Google sign-in gives each person their own Brain. */
export const DEMO_USER = 'demo'
