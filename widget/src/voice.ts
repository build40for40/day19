import { MAX_SPEAK_SECONDS } from '../../src/contract'

const INSTEAD = 'Type it, or just say it to the assistant out loud.'

export interface Recording {
  /** Stops recording. The words arrive through `onDone`. */
  stop(): void
}

export interface Clip {
  /** The recording, base64 encoded. */
  audio: string
  mimeType: string
}

const base64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/**
 * Records from the microphone until stopped, or for 30 seconds. The browser's own speech to text isn't used: chat
 * apps that give the widget a mic often have no speech service behind it, so the server turns the clip into words.
 * Resolves to why it couldn't start, or to the recording.
 */
export async function record(onDone: (clip: Clip | undefined, problem?: string) => void): Promise<Recording | string> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    return `This chat app doesn't give the widget a mic (no recorder). ${INSTEAD}`
  }
  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (error) {
    const name = error instanceof Error ? error.name : 'unknown'
    return name === 'NotFoundError'
      ? `No microphone found (${name}). ${INSTEAD}`
      : `This chat app hasn't given the widget the mic (${name}). ${INSTEAD}`
  }
  const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type))
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => void (event.data.size && chunks.push(event.data))
  const timer = setTimeout(() => recorder.state === 'recording' && recorder.stop(), MAX_SPEAK_SECONDS * 1000)
  recorder.onstop = async () => {
    clearTimeout(timer)
    for (const track of stream.getTracks()) track.stop()
    const blob = new Blob(chunks, { type: recorder.mimeType })
    if (!blob.size) return onDone(undefined, `Nothing came through from the mic. ${INSTEAD}`)
    onDone({ audio: await base64(blob), mimeType: recorder.mimeType })
  }
  recorder.onerror = () => {
    clearTimeout(timer)
    for (const track of stream.getTracks()) track.stop()
    onDone(undefined, `The recording stopped by itself. ${INSTEAD}`)
  }
  recorder.start()
  return { stop: () => recorder.state === 'recording' && recorder.stop() }
}
