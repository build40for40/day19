import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Person } from './google'

/** A made-up Google account. Every request the Brain makes to Google lands here. */
function fakeGoogle(people: Person[]) {
  const calls: string[] = []
  const contacts = new Map(people.map((p) => [p.resourceName, p]))
  const created: Partial<Person>[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = init?.method ?? 'GET'
    calls.push(`${method} ${url.pathname}`)
    if (url.pathname === '/v1/people/me/connections') {
      return Response.json({ connections: [...contacts.values()], nextSyncToken: 'sync-1', totalPeople: contacts.size })
    }
    if (url.pathname === '/v1/people:batchGet') {
      const wanted = url.searchParams.getAll('resourceNames')
      return Response.json({ responses: wanted.flatMap((name) => (contacts.has(name) ? [{ person: contacts.get(name) }] : [])) })
    }
    const deleting = url.pathname.match(/^\/v1\/(people\/[^:]+):deleteContact$/)
    if (deleting && method === 'DELETE') {
      contacts.delete(deleting[1]!)
      return new Response('{}')
    }
    if (url.pathname === '/v1/people:createContact' && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as Partial<Person>
      created.push(body)
      const made = { ...body, resourceName: `people/new${created.length}`, etag: 'e-new', metadata: { sources: [{ type: 'CONTACT', updateTime: '2026-11-26T12:00:00Z' }] } } as Person
      contacts.set(made.resourceName, made)
      return Response.json(made)
    }
    return new Response('not faked', { status: 500 })
  })
  return { calls, contacts, created }
}

const person = (id: string, name: string, updateTime: string, extra: Partial<Person> = {}): Person => ({
  resourceName: `people/${id}`,
  etag: `e-${id}`,
  names: [{ displayName: name }],
  emailAddresses: [{ value: `${id}@example.com` }],
  metadata: { sources: [{ type: 'CONTACT', updateTime }] },
  ...extra,
})

const starred = { memberships: [{ contactGroupMembership: { contactGroupResourceName: 'contactGroups/starred' } }] }

afterEach(() => vi.restoreAllMocks())

describe('a signed-in Brain', () => {
  it("picks 3 oldest plus the 2 who matter, then lets go by snapshotting and deleting from Google", async () => {
    const google = fakeGoogle([
      person('a', 'Ada Old', '2012-01-01T00:00:00Z'),
      person('b', 'Ben Older', '2011-01-01T00:00:00Z'),
      person('c', 'Cat Oldest', '2010-01-01T00:00:00Z'),
      person('d', 'Dan Recent', '2025-01-01T00:00:00Z'),
      person('e', 'Eve Mum', '2024-06-01T00:00:00Z', { ...starred, birthdays: [{}] }),
      person('f', 'Fay Friend', '2023-01-01T00:00:00Z', starred),
    ])
    const brain = env.BRAINS.get(env.BRAINS.idFromName('google-test-user'))
    await brain.setProfile({ userId: 'google-test-user', email: 'me@example.com', familyName: 'Example' })

    const batch = await brain.next(undefined, false, 'fake-token')
    expect(batch.contacts.map((c) => c.name)).toEqual(['Eve Mum', 'Fay Friend', 'Cat Oldest', 'Ben Older', 'Ada Old'])
    expect(batch.contacts[0]).toEqual({ id: 'people/e', name: 'Eve Mum', emails: ['e@example.com'], phones: [], photoUrl: null, organisation: '' })
    expect(batch.progress).toEqual({ decided: 0, total: 6 })

    const kept = await brain.keep('people/e', 'She taught me to swim', 'fake-token')
    expect(kept).toMatchObject({ ok: true, value: { decision: 'kept' } })

    const gone = await brain.letGo('people/c', 'fake-token')
    expect(gone).toMatchObject({ ok: true, value: { decision: 'let_go', progress: { decided: 2, total: 6 } } })
    // Snapshot first, then the delete.
    const order = google.calls.filter((c) => c.includes('batchGet') || c.includes('deleteContact'))
    expect(order).toEqual(['GET /v1/people:batchGet', 'DELETE /v1/people/c:deleteContact'])
    expect(google.contacts.has('people/c')).toBe(false)

    const listed = await brain.listContacts({})
    const byName = Object.fromEntries(listed.contacts.map((c) => [c.name, c]))
    expect(byName['Eve Mum']).toMatchObject({ status: 'kept', gratitude: 'She taught me to swim' })
    expect(byName['Cat Oldest']).toMatchObject({ status: 'let_go', hasSnapshot: true })
    expect(await brain.markdown('fake-token')).toContain('Grateful for: She taught me to swim')
  })

  it('starts today over: kept goes back to new, and let go is created again in Google from the snapshot', async () => {
    const google = fakeGoogle([
      person('a', 'Ada Old', '2012-01-01T00:00:00Z', {
        names: [
          { displayName: 'Ada Old', metadata: { source: { type: 'CONTACT' } } },
          { displayName: 'Ada Profile', metadata: { source: { type: 'PROFILE' } } },
        ],
        photos: [{ url: 'https://lh3.googleusercontent.com/example' }],
      } as unknown as Partial<Person>),
      person('b', 'Ben Older', '2011-01-01T00:00:00Z'),
    ])
    const brain = env.BRAINS.get(env.BRAINS.idFromName('google-start-over-user'))
    await brain.setProfile({ userId: 'google-start-over-user', email: 'me@example.com', familyName: 'Example' })

    await brain.next(undefined, false, 'fake-token')
    await brain.letGo('people/a', 'fake-token')
    await brain.keep('people/b', 'She taught me to swim', 'fake-token')
    expect(google.contacts.has('people/a')).toBe(false)

    const over = await brain.startOver('fake-token')
    expect(over).toMatchObject({ kept: 1, letGo: 1, batch: { doneForToday: false, progress: { decided: 0, total: 2 } } })
    expect(over.batch.contacts.map((c) => c.id).sort()).toEqual(['people/b', 'people/new1'])
    // Only the person's own name is written back, with none of Google's metadata, photo or ids.
    expect(google.created).toEqual([{ names: [{ displayName: 'Ada Old' }], emailAddresses: [{ value: 'a@example.com' }] }])

    const listed = await brain.listContacts({})
    expect(listed.contacts.map((c) => [c.id, c.status, c.gratitude])).toEqual([
      ['people/new1', 'new', null],
      ['people/b', 'new', null],
    ])
    expect(await brain.markdown('fake-token')).toContain('Nobody here yet')

    // The restored contact plays like any other.
    expect(await brain.keep('people/new1', 'the lift home', 'fake-token')).toMatchObject({ ok: true })
  })

  it('refuses to be reset like the demo', async () => {
    fakeGoogle([])
    const brain = env.BRAINS.get(env.BRAINS.idFromName('google-reset-user'))
    await brain.setProfile({ userId: 'google-reset-user', email: 'me@example.com', familyName: '' })
    expect(await brain.reset()).toEqual({ ok: false, error: 'Only the demo can be reset.' })
  })
})
