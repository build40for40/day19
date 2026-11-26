import { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables, type McpUiHostContext } from '@modelcontextprotocol/ext-apps'

import { BATCH_SIZE, MAX_GRATITUDE, MIN_GRATITUDE, type Batch, type Contact, type Progress } from '../../src/contract'
import './style.css'
import { fakeTools, mcpTools, type Tools } from './tools'

type Child = Node | string | false | undefined
type Props = Record<string, string | boolean | ((event: Event) => void)>

/** Builds an element. Text always goes in as text, never as HTML, since names come from someone's contacts. */
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'function') el.addEventListener(key, value)
    else if (value === true) el.setAttribute(key, '')
    else if (value !== false) el.setAttribute(key, value)
  }
  for (const child of children) if (child) el.append(child)
  return el
}

type Outcome = { kind: 'kept'; gratitude: string } | { kind: 'let_go' } | { kind: 'elsewhere' }

// `?fake=1`, or opening the page on its own in a browser tab, plays the game on made-up contacts with no server.
const fake = new URLSearchParams(location.search).has('fake') || window.parent === window

const root = document.getElementById('app')!
const app = new App({ name: 'Gobbler', version: '0.3.0' })
const tools: Tools = fake ? fakeTools() : mcpTools(app)

let batch: Contact[] | undefined
let progress: Progress | undefined
const outcomes = new Map<string, Outcome>()
let keeping = false
let busy = false
let problem = ''
let draft = ''

/** How long a let go waits before it really happens, so there's time to take it back. */
const UNDO_MS = 5000
/** A let go that hasn't been sent to the server yet. */
let pending: { contact: Contact; before: Progress | undefined; timer: ReturnType<typeof setTimeout> } | undefined
/** The contact on screen last time, so a new one can be dealt in. */
let shown: string | undefined
/** The contact decided a moment ago, so its dot can pop once. */
let justDecided: string | undefined

/** A tiny buzz on phones that allow it (Android, mostly). Everywhere else it does nothing. */
function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Some chat apps block it. It's only a nicety.
  }
}

/**
 * The turkey's tail: four rounded feathers side by side with pale tips, fanning up from behind the back to the head,
 * stretched a little taller than a half circle. Each feather is drawn twice, the pale tip and then the gold inside it.
 */
const TAIL = `<g transform="translate(0 52) scale(1 1.25) translate(0 -52)">
  <path class="feather-tip" d="M40 52L5.5 58.1A11.4 11.4 0 0 1 8.2 37.5Z"/>
  <path class="feather-tip" d="M40 52L8.2 37.5A11.4 11.4 0 0 1 22 22Z"/>
  <path class="feather-tip" d="M40 52L22 22A11.4 11.4 0 0 1 42.1 17.1Z"/>
  <path class="feather-tip" d="M40 52L42.1 17.1A11.4 11.4 0 0 1 61.5 24.4Z"/>
  <path class="feather" d="M40 52L10.9 57.1A9.6 9.6 0 0 1 13.2 39.8Z"/>
  <path class="feather" d="M40 52L13.2 39.8A9.6 9.6 0 0 1 24.8 26.7Z"/>
  <path class="feather" d="M40 52L24.8 26.7A9.6 9.6 0 0 1 41.8 22.6Z"/>
  <path class="feather" d="M40 52L41.8 22.6A9.6 9.6 0 0 1 58.2 28.8Z"/>
</g>`

/** The turkey on the done screen. It pecks up the crumbs. Nothing from the contacts goes into it. */
function turkey() {
  const bird = h('div', { class: 'turkey' })
  bird.innerHTML = `<svg viewBox="0 0 104 76" width="104" height="76" aria-hidden="true">
  ${TAIL}
  <path class="bird-line" d="M38 66v6M50 66v6M34 72h8M46 72h8"/>
  <circle class="bird-body" cx="44" cy="50" r="17"/>
  <path class="bird-wing" d="M34 50c2 8 12 9 16 2"/>
  <g class="bird-head">
    <path class="bird-neck" d="M56 46c4-4 6-9 6-14"/>
    <circle class="bird-body" cx="63" cy="28" r="8"/>
    <circle class="bird-eye" cx="65.5" cy="26" r="1.6"/>
    <path class="bird-beak" d="M70 25l9 3-9 1z"/>
    <path class="bird-beak bird-jaw" d="M70 29l8 0-8 3z"/>
    <path class="bird-wattle" d="M69 32c3 0 4 3 2 6-2 0-3-3-2-6z"/>
  </g>
  <circle class="crumb c1" cx="90" cy="46" r="2.2"/>
  <circle class="crumb c2" cx="95" cy="50" r="2.2"/>
  <circle class="crumb c3" cx="88" cy="54" r="2.2"/>
</svg>`
  return bird
}

const firstName = (contact: Contact) => contact.name.split(' ')[0] ?? contact.name
const initials = (contact: Contact) =>
  contact.name
    .split(/\s+/)
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

/**
 * Ways to start the line, built only from what the contact card already says: their name and where they work.
 * They stop mid-sentence on purpose. The person finishes the thought, so the thanks is still theirs.
 */
function starters(contact: Contact): string[] {
  const first = firstName(contact)
  const org = contact.organisation.trim()
  return [...(org ? [`At ${org}, ${first} `] : []), `${first} taught me `, `I still remember when ${first} `, 'Thank you for '].slice(0, 3)
}

/** What the person has added beyond a starter, so a starter on its own doesn't count as thanks. */
function ownWords(text: string, contact: Contact) {
  const starter = starters(contact).find((start) => text.startsWith(start.trim()))
  return starter ? text.slice(starter.trim().length).trim() : text
}

const isBatch = (value: unknown): value is Batch =>
  typeof value === 'object' && value !== null && Array.isArray((value as Batch).contacts) && typeof (value as Batch).doneForToday === 'boolean'

function reset() {
  keeping = false
  busy = false
  problem = ''
  draft = ''
}

/** A fresh batch from the server: what a new widget starts from. */
function start(next: Batch) {
  if (pending) clearTimeout(pending.timer)
  pending = undefined
  shown = undefined
  batch = next.contacts
  progress = next.progress
  outcomes.clear()
  reset()
  render()
}

/** Checks the server for what's still waiting, so a contact decided by talking to the assistant doesn't get asked twice. */
async function catchUp() {
  if (!batch) return
  const { contacts, progress: latest } = await tools.next()
  const waiting = new Set(contacts.map((contact) => contact.id))
  for (const contact of batch) if (!outcomes.has(contact.id) && !waiting.has(contact.id)) outcomes.set(contact.id, { kind: 'elsewhere' })
  progress = latest
}

async function decide(contact: Contact, run: () => Promise<{ progress: Progress }>, outcome: Outcome, said: string) {
  if (busy) return
  busy = true
  problem = ''
  render()
  // A let go still waiting on its undo goes first, so the server hears things in the order they happened.
  await commitLetGo()
  try {
    progress = (await run()).progress
    outcomes.set(contact.id, outcome)
    justDecided = contact.id
    buzz(12)
    reset()
    render()
    // Tell the assistant what happened in the widget, so it doesn't offer the same contact again.
    if (!fake) void app.updateModelContext({ content: [{ type: 'text', text: said }] }).catch(() => {})
  } catch (error) {
    const message = error instanceof Error ? error.message : "That didn't save. Give it another go."
    await catchUp().catch(() => {})
    busy = false
    // If it turned out to be decided already, just move on to the next one.
    problem = outcomes.has(contact.id) ? '' : message
    if (outcomes.has(contact.id)) reset()
    render()
  }
}

/** Let go moves straight on to the next contact, and only reaches the server once the undo has run out. */
function letGo(contact: Contact) {
  if (busy) return
  void commitLetGo().then(() => {
    const timer = setTimeout(() => void commitLetGo(), UNDO_MS)
    pending = { contact, before: progress, timer }
    outcomes.set(contact.id, { kind: 'let_go' })
    justDecided = contact.id
    buzz(8)
    if (progress) progress = { ...progress, decided: progress.decided + 1 }
    reset()
    render()
  })
}

function undoLetGo() {
  if (!pending) return
  clearTimeout(pending.timer)
  outcomes.delete(pending.contact.id)
  progress = pending.before
  pending = undefined
  reset()
  render()
}

/** Sends the waiting let go, if there is one. If it fails, the contact comes back with the reason. */
async function commitLetGo() {
  if (!pending) return
  const { contact, before, timer } = pending
  clearTimeout(timer)
  pending = undefined
  try {
    progress = (await tools.letGo(contact.id)).progress
    if (!fake) void app.updateModelContext({ content: [{ type: 'text', text: `I let ${contact.name} go in the widget. A copy is in the Brain.` }] }).catch(() => {})
  } catch (error) {
    outcomes.delete(contact.id)
    progress = before
    await catchUp().catch(() => {})
    if (!outcomes.has(contact.id)) problem = error instanceof Error ? error.message : "That didn't save. Give it another go."
  }
  render()
}

function top(current: number) {
  const contacts = batch ?? []
  const today = current < contacts.length ? `${current + 1} of ${contacts.length} today` : 'Done for today'
  return h(
    'div',
    { class: 'top' },
    h('span', {}, h('span', { class: 'brand' }, 'Gobbler'), h('span', { class: 'overall' }, ` · ${today}`)),
    h(
      'div',
      { class: 'dots', 'aria-hidden': 'true' },
      ...contacts.map((contact, i) => h('span', { class: `dot ${outcomes.get(contact.id)?.kind ?? (i === current ? 'now' : '')}${contact.id === justDecided ? ' pop' : ''}` })),
    ),
  )
}

function avatar(contact: Contact) {
  const fallback = h('div', { class: 'avatar', 'aria-hidden': 'true' }, initials(contact))
  if (!contact.photoUrl) return fallback
  const photo = h('img', { class: 'avatar', src: contact.photoUrl, alt: '', referrerpolicy: 'no-referrer' })
  // A photo the chat app won't load falls back to initials.
  photo.addEventListener('error', () => photo.replaceWith(fallback))
  return photo
}

function who(contact: Contact) {
  return h(
    'div',
    { class: 'who' },
    avatar(contact),
    h('div', {}, h('p', { class: 'name' }, contact.name), contact.organisation ? h('p', { class: 'detail' }, contact.organisation) : false),
  )
}

function choose(contact: Contact) {
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          class: 'grow',
          'aria-busy': String(busy),
          click: () => letGo(contact),
        },
        'Let go',
      ),
      h(
        'button',
        {
          class: 'primary grow',
          click: () => {
            keeping = true
            problem = ''
            render()
            document.querySelector('textarea')?.focus()
          },
        },
        'Keep',
      ),
    ),
    h('p', { class: 'hint' }, "Let go deletes them from Google Contacts and any phone synced to it. Your Brain keeps a copy, so nobody's lost."),
    h('p', { class: 'error', role: 'alert' }, problem),
  )
}

function gratitude(contact: Contact) {
  const first = firstName(contact)
  const ideas = starters(contact)
  const box = h('textarea', { id: 'gratitude', maxlength: String(MAX_GRATITUDE), placeholder: `${ideas[0]}…`, 'aria-describedby': 'gratitude-help' })
  box.value = draft
  const error = h('p', { class: 'error', role: 'alert' }, problem)
  const count = h('span', { class: 'count' })
  const help = h('span', { id: 'gratitude-help' }, 'Tap a starter, or press → in the empty box.')

  const use = (idea: string) => {
    box.value = draft = idea
    box.focus()
    box.setSelectionRange(idea.length, idea.length)
    refresh()
  }
  const chips = h('div', { class: 'chips' }, ...ideas.map((idea) => h('button', { type: 'button', class: 'chip', click: () => use(idea) }, `${idea.trim()}…`)))

  // The starters are only offered while the box is empty or still holds one of them untouched.
  function refresh() {
    const left = MAX_GRATITUDE - box.value.length
    count.textContent = left <= 40 ? `${left} left` : ''
    chips.hidden = box.value !== '' && !ideas.includes(box.value)
    help.style.visibility = chips.hidden ? 'hidden' : 'visible'
  }

  box.addEventListener('input', () => {
    draft = box.value
    error.textContent = ''
    problem = ''
    refresh()
  })

  const save = () => {
    const text = box.value.trim()
    if (text.length < MIN_GRATITUDE) {
      error.textContent = problem = `No thanks, no keep. Give ${first} a line first.`
      return
    }
    if (ownWords(text, contact).length < MIN_GRATITUDE) {
      error.textContent = problem = `Finish the line first. What did ${first} do?`
      return
    }
    void decide(
      contact,
      () => tools.keep(contact.id, text),
      { kind: 'kept', gratitude: text },
      `I kept ${contact.name} in the widget and said what I'm grateful for. It's saved in the Brain.`,
    )
  }

  box.addEventListener('keydown', (event) => {
    // The right arrow or Tab in an empty box takes the grey suggestion, the way a search box does.
    if ((event.key === 'ArrowRight' || event.key === 'Tab') && !event.shiftKey && box.value === '') {
      event.preventDefault()
      use(ideas[0]!)
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      save()
    }
  })
  refresh()

  return h(
    'div',
    {},
    h('label', { for: 'gratitude' }, `What are you grateful to ${first} for?`),
    box,
    h('div', { class: 'under' }, help, count),
    chips,
    error,
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          click: () => {
            keeping = false
            problem = ''
            render()
          },
        },
        'Back',
      ),
      h('button', { class: 'primary grow', 'aria-busy': String(busy), click: save }, `Keep ${first}`),
    ),
  )
}

/** How far through the whole list they are, and how long the rest takes at five a day. */
function tracker() {
  if (!progress || progress.total === 0) return false
  const left = Math.max(progress.total - progress.decided, 0)
  const days = Math.ceil(left / BATCH_SIZE)
  const ahead = left === 0 ? "That's everyone. Nobody left to sort." : `${left} to go. At five a day, that's ${days === 1 ? 'one more day' : `${days} more days`}.`
  const bar = h('div', { class: 'bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(progress.total), 'aria-valuenow': String(progress.decided) })
  const fill = h('div', { class: 'fill' })
  fill.style.width = `${Math.round((progress.decided / progress.total) * 100)}%`
  bar.append(fill)
  return h('div', { class: 'tracker' }, h('p', { class: 'tracker-count' }, `${progress.decided} of ${progress.total} sorted`), bar, h('p', { class: 'tracker-ahead' }, ahead))
}

function done(contacts: Contact[]) {
  const by = (kind: Outcome['kind']) => contacts.filter((contact) => outcomes.get(contact.id)?.kind === kind)
  const kept = by('kept')
  const letGo = by('let_go')
  const elsewhere = by('elsewhere')
  const names = (list: Contact[]) => list.map((contact) => contact.name).join(', ')
  const left = progress ? Math.max(progress.total - progress.decided, 0) : 0
  const thanks = kept.map((contact) => {
    const outcome = outcomes.get(contact.id)
    return h('figure', { class: 'thanks' }, h('blockquote', {}, outcome?.kind === 'kept' ? outcome.gratitude : ''), h('figcaption', {}, contact.name))
  })
  return h(
    'div',
    { class: 'card deal done' },
    turkey(),
    h('p', { class: 'done-title' }, contacts.length ? `That's your ${contacts.length === BATCH_SIZE ? 'five' : 'lot'}. Well gobbled.` : "That's today done"),
    h('p', { class: 'done-body' }, contacts.length ? `${kept.length} thanked, ${letGo.length} let go.` : left > 0 ? 'More tomorrow, or go again now.' : 'Your list is clean.'),
    ...thanks,
    letGo.length > 0 && h('p', { class: 'gone' }, `Let go: ${names(letGo)}`),
    elsewhere.length > 0 && h('p', { class: 'gone' }, `Sorted in the chat: ${names(elsewhere)}`),
    tracker(),
    h('p', { class: 'error', role: 'alert' }, problem),
    (left > 0 || !fake) &&
      h(
        'div',
        { class: 'row' },
        !fake &&
          h(
            'button',
            { click: () => void app.sendMessage({ role: 'user', content: [{ type: 'text', text: 'Show me my Brain.' }] }).catch(() => {}) },
            'Read my Brain',
          ),
        // Five a day is the habit, not a wall: anyone on a roll can go again.
        left > 0 && h('button', { class: 'primary grow', 'aria-busy': String(busy), click: () => void goAgain() }, left >= BATCH_SIZE ? 'Five more' : `The last ${left}`),
      ),
  )
}

/** Once a round ends with someone kept, asks the assistant (as the person) to draft their thank-yous in Gmail. Drafts are never sent. */
function askForDrafts() {
  if (fake || !batch?.some((contact) => outcomes.get(contact.id)?.kind === 'kept')) return
  const text = "That's my five done. Draft thank-you emails for the people I just kept and save them in my Gmail drafts."
  void app.sendMessage({ role: 'user', content: [{ type: 'text', text }] }).catch(() => {})
}

/** Asks for the next five once today's are done. A let go still waiting on its undo is sent first. */
async function goAgain() {
  if (busy) return
  busy = true
  problem = ''
  render()
  try {
    await commitLetGo()
    const batch = await tools.more()
    if (!batch.contacts.length) throw new Error('Nobody left to deal. Your list is clean.')
    start(batch)
    if (!fake) void app.updateModelContext({ content: [{ type: 'text', text: 'I asked for five more contacts in the widget.' }] }).catch(() => {})
  } catch (error) {
    busy = false
    problem = error instanceof Error ? error.message : "Couldn't deal more. Give it another go."
    render()
  }
}

/** The bar that follows a let go: who it was, and a few seconds to take it back. */
function undoBar() {
  if (!pending) return false
  return h(
    'div',
    { class: 'toast', role: 'status' },
    h('span', {}, `${pending.contact.name} let go`),
    h('button', { type: 'button', class: 'link', click: undoLetGo }, 'Undo'),
    h('span', { class: 'timer', 'aria-hidden': 'true' }),
  )
}

function render() {
  if (!batch) {
    root.replaceChildren(h('div', { class: 'top' }, h('span', {}, problem || "Rounding up today's five…")))
    return
  }
  const current = batch.findIndex((contact) => !outcomes.has(contact.id))
  if (current < 0) {
    const fresh = shown !== 'done'
    shown = 'done'
    if (fresh) {
      buzz([14, 70, 14, 70, 30])
      askForDrafts()
    }
    const card = done(batch)
    card.classList.toggle('deal', fresh)
    root.replaceChildren(top(batch.length), card, undoBar() || '')
    justDecided = undefined
    return
  }
  const contact = batch[current]!
  const facts = h('div', { class: 'facts' }, ...[...contact.emails, ...contact.phones].map((fact) => h('div', {}, fact)))
  // A new contact is dealt in. Redrawing the same one (opening the box, an error) stays still.
  const card = h('div', { class: shown === contact.id ? 'card' : 'card deal' }, who(contact), facts, keeping ? gratitude(contact) : choose(contact))
  shown = contact.id
  root.replaceChildren(top(current), card, undoBar() || '')
  justDecided = undefined
}

function styleFromHost(context: McpUiHostContext) {
  if (context.theme) applyDocumentTheme(context.theme)
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables)
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts)
}

render()

if (fake) {
  void tools.next().then(start)
} else {
  app.ontoolresult = (result) => {
    if (isBatch(result.structuredContent)) start(result.structuredContent)
  }
  app.onhostcontextchanged = styleFromHost
  // Closing the widget counts as not wanting the undo, so a waiting let go is sent rather than lost.
  app.onteardown = async () => {
    await commitLetGo()
    return {}
  }
  app.onerror = console.error
  // Coming back to the widget after deciding in the chat: drop anyone the assistant has already dealt with.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && batch && !busy && !keeping && !pending) void catchUp().then(render, () => {})
  })
  void app.connect().then(() => {
    const context = app.getHostContext()
    if (context) styleFromHost(context)
  })
}
