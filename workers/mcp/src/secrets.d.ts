// Optional secrets the generated Env (worker-configuration.d.ts) doesn't list, because the Worker runs without them.

interface Env {
  /** Polishes thank-you drafts (thankyou.ts). Without it, drafts use the plain template. */
  ANTHROPIC_API_KEY?: string
}
