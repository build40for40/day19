import type { Outcome } from './brain'
import type { Heard } from './contract'
import type { Env } from './env'

/** About 1.5MB of audio as base64, far more than 30 seconds of speech needs. */
export const MAX_AUDIO_CHARS = 2_000_000

/** Turns a short voice clip into words with Cloudflare's Whisper model. Nothing is stored. */
export async function hear(env: Env, audio: string): Promise<Outcome<Heard>> {
  try {
    const { text } = await env.AI.run('@cf/openai/whisper-large-v3-turbo', { audio, task: 'transcribe', vad_filter: true })
    const heard = (text ?? '').trim()
    return heard ? { ok: true, value: { text: heard } } : { ok: false, error: "Didn't catch any words. Try again or type it." }
  } catch (error) {
    console.error('Transcription failed:', error instanceof Error ? error.name : 'unknown')
    return { ok: false, error: "Couldn't turn that into words. Try again or type it." }
  }
}

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' }

/**
 * The same thing over plain HTTP, for the widget to call directly. A clip is big for a tool call, and chat apps differ
 * in how they pass those along, so the widget tries this first. The widget runs on the chat app's own sandbox address,
 * which is why any origin is allowed.
 */
export async function handleTranscribe(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (request.method !== 'POST') return Response.json({ error: 'POST a clip here.' }, { status: 405, headers: cors })
  const body = await request.json<{ audio?: unknown }>().catch(() => undefined)
  if (typeof body?.audio !== 'string' || !body.audio || body.audio.length > MAX_AUDIO_CHARS) {
    return Response.json({ error: "That recording couldn't be read. Try again or type it." }, { status: 400, headers: cors })
  }
  const result = await hear(env, body.audio)
  return result.ok ? Response.json(result.value, { headers: cors }) : Response.json({ error: result.error }, { status: 422, headers: cors })
}
