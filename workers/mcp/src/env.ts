/** The signed-in MCP endpoint. Needs a token from Google sign-in. */
export const MCP_PATH = '/mcp'

/** The same tools on made-up contacts, with no sign-in. Everyone shares one Brain here. */
export const DEMO_MCP_PATH = '/demo/mcp'

/** The one shared Brain behind the demo endpoint. Signed-in people get a Brain named after their Google id. */
export const DEMO_USER = 'demo'

/** The one scope our OAuth server grants. It stands for the Google contacts access behind it. */
export const OAUTH_SCOPE = 'contacts'
