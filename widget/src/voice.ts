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

export const BLOCKED = "The mic isn't available here. Type it, or just say it to the assistant out loud."

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
    problem = error === 'not-allowed' || error === 'service-not-allowed' ? BLOCKED : "Didn't catch that. Try again or type it."
  }
  recognition.onend = () => handlers.onStop(problem)
  try {
    recognition.start()
  } catch {
    handlers.onStop(BLOCKED)
    return undefined
  }
  return { stop: () => recognition.stop() }
}
