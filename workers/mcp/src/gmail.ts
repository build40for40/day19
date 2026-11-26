// Saves thank-you emails as Gmail drafts. Drafts only: nothing here sends, reads or deletes mail.
// Needs the gmail.compose scope. Anyone who signed in before it was added gets GmailScopeMissingError
// until they sign in again.

const DRAFTS_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts'

/** Where the widget's "Open Gmail drafts" button goes. */
export const GMAIL_DRAFTS_URL = 'https://mail.google.com/mail/u/0/#drafts'

/** The sign-in doesn't include Gmail drafts yet. Signing in again fixes it. */
export class GmailScopeMissingError extends Error {}

export interface Email {
  to: string
  toName: string
  subject: string
  body: string
}

const base64 = (text: string) => {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

const base64url = (text: string) => base64(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** A header value that may hold any Unicode, as RFC 2047 says. */
const encodedWord = (text: string) => (/^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${base64(text)}?=`)

/** The email as RFC 2822 text, which is what Gmail's drafts API takes. */
export function rfc2822({ to, toName, subject, body }: Email): string {
  const name = toName.replace(/["\\\r\n]/g, '')
  return [
    `To: ${encodedWord(`"${name}"`)} <${to.replace(/[\r\n<>]/g, '')}>`,
    `Subject: ${encodedWord(subject.replace(/[\r\n]/g, ' '))}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64(body.replace(/\r?\n/g, '\r\n')),
  ].join('\r\n')
}

/** Saves one draft in the signed-in person's Gmail and returns its id. */
export async function createDraft(accessToken: string, email: Email): Promise<string> {
  const response = await fetch(DRAFTS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { raw: base64url(rfc2822(email)) } }),
  })
  if (response.status === 403 || response.status === 401) {
    const detail = await response.text()
    if (/insufficient|scope|PERMISSION_DENIED/i.test(detail)) throw new GmailScopeMissingError('Sign in again to let Gobbler save Gmail drafts.')
    throw new Error(`Gmail refused the draft (${response.status})`)
  }
  if (!response.ok) throw new Error(`Gmail drafts failed (${response.status})`)
  const draft = (await response.json()) as { id: string }
  return draft.id
}
