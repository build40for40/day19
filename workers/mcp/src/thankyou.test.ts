import { describe, expect, it } from 'vitest'

import { rfc2822 } from './gmail'
import { THANKS_PS } from './mcp/text'
import { assemble, templateSentences, writeThankYou } from './thankyou'

const input = { contactName: 'Sam Adams', gratitude: 'he always bought me a beer', senderName: 'Lawrence Kao' }

describe('thank-you drafts', () => {
  it('wraps the sentences in a greeting, a sign-off and the Gobbler P.S.', () => {
    const body = assemble('Thank you for always buying me a beer.', input)
    expect(body.startsWith('Hi Sam,\n\nThank you for always buying me a beer.')).toBe(true)
    expect(body).toContain('Thanks,\nLawrence')
    expect(body.endsWith(THANKS_PS)).toBe(true)
  })

  it('falls back to the template, in their own words, without an API key', async () => {
    const email = await writeThankYou(undefined, input)
    expect(email.polished).toBe(false)
    expect(email.subject).toBe('Thank you')
    expect(email.body).toContain('why I kept you: he always bought me a beer.')
    expect(templateSentences({ ...input, gratitude: 'Taught me chess!' })).toMatch(/Taught me chess!$/)
  })

  it('builds a Gmail draft with UTF-8 headers and a base64 body', () => {
    const raw = rfc2822({ to: 'sam@example.com', toName: 'Zoë "Z" Example', subject: 'Thank you 🦃', body: 'Hi Zoë,\nThanks' })
    expect(raw).toContain('To: =?UTF-8?B?')
    expect(raw).toContain('<sam@example.com>')
    expect(raw).toContain('Subject: =?UTF-8?B?')
    expect(raw).toContain('Content-Type: text/plain; charset=UTF-8')
    const body = raw.split('\r\n\r\n')[1]!
    expect(new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0)))).toBe('Hi Zoë,\r\nThanks')
  })

  it('keeps line breaks and injected headers out of the address and subject', () => {
    const raw = rfc2822({ to: 'a@example.com\r\nBcc: x@example.com', toName: 'A', subject: 'Hi\r\nBcc: y@example.com', body: '' })
    expect(raw.split('\r\n').filter((line) => line.startsWith('Bcc:'))).toHaveLength(0)
  })
})
