/** The browser's speech to text, where there is one. Chrome, Edge and Safari have it. Firefox doesn't. */
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

type RecognitionClass = new () => Recognition

const Speech = (globalThis as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass })
const RecognitionImpl = Speech.SpeechRecognition ?? Speech.webkitSpeechRecognition

export const canListen = Boolean(RecognitionImpl)

export interface Listener {
  stop(): void
}

const INSTEAD = 'Type it, or just say it to the assistant out loud.'

export const BLOCKED = `The mic isn't available here. ${INSTEAD}`

/**
 * Asks for the microphone and lets go of it again straight away. Speech to text fails silently in some chat apps, and
 * this is the only way to learn whether the app gave the widget the mic at all. Returns why not, or nothing if it did.
 */
export async function micProblem(): Promise<string | undefined> {
  if (!navigator.mediaDevices?.getUserMedia) return `This chat app doesn't give the widget a mic (no media devices). ${INSTEAD}`
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    for (const track of stream.getTracks()) track.stop()
    return undefined
  } catch (error) {
    const name = error instanceof Error ? error.name : 'unknown'
    return `This chat app hasn't given the widget the mic (${name}). ${INSTEAD}`
  }
}

/** Starts listening and reports everything heard so far each time it changes. */
export function listen(handlers: { onText(text: string): void; onStop(problem?: string): void }): Listener | undefined {
  if (!RecognitionImpl) {
    handlers.onStop(BLOCKED)
    return undefined
  }
  const recognition = new RecognitionImpl()
  recognition.lang = navigator.language || 'en-GB'
  recognition.interimResults = true
  recognition.continuous = true
  let problem: string | undefined
  recognition.onresult = (event) => {
    let text = ''
    for (let i = 0; i < event.results.length; i++) text += event.results[i]?.[0]?.transcript ?? ''
    handlers.onText(text.trim())
  }
  recognition.onerror = ({ error }) => {
    if (error === 'aborted' || error === 'no-speech') return
    // "network" is what a desktop app says when it has a mic but no speech to text service behind it.
    problem =
      error === 'audio-capture'
        ? `No microphone found (${error}). ${INSTEAD}`
        : error === 'not-allowed' || error === 'service-not-allowed' || error === 'network' || error === 'language-not-supported'
          ? `The mic works, but this chat app has no speech to text (${error}). ${INSTEAD}`
          : `Didn't catch that (${error}). Try again or type it.`
  }
  let heard = false
  let asked = false
  const report = handlers.onText
  handlers = { ...handlers, onText: (text) => ((heard = true), report(text)) }
  // Ending without a word and without an error is the silent failure: say so rather than doing nothing.
  recognition.onend = () => handlers.onStop(problem ?? (heard || asked ? undefined : `Nothing came through from the mic. ${INSTEAD}`))
  try {
    recognition.start()
  } catch {
    handlers.onStop(BLOCKED)
    return undefined
  }
  return {
    stop: () => {
      asked = true
      recognition.stop()
    },
  }
}
