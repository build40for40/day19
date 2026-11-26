import type { Brain } from './brain'

export interface Env {
  BRAINS: DurableObjectNamespace<Brain>
}

export const MCP_PATH = '/mcp'

/** Everyone shares one made-up contacts list until Google sign-in gives each person their own Brain. */
export const DEMO_USER = 'demo'
