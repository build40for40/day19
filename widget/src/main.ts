import { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables, type McpUiHostContext } from '@modelcontextprotocol/ext-apps'

import { MAX_GRATITUDE, MIN_GRATITUDE, type Batch, type Contact, type Progress } from '../../src/contract'
import './style.css'
import { fakeTools, mcpTools, type Tools } from './tools'
import { BLOCKED, canListen, listen, micProblem, type Listener } from './voice'

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
const app = new App({ name: 'Day 19 contacts', version: '0.2.0' })
const tools: Tools = fake ? fakeTools() : mcpTools(app)

let batch: Contact[] | undefined
let progress: Progress | undefined
const outcomes = new Map<string, Outcome>()
let keeping = false
let busy = false
let problem = ''
let draft = ''
let spoken = false
let listener: Listener | undefined

const firstName = (contact: Contact) => contact.name.split(' ')[0] ?? contact.name
const initials = (contact: Contact) =>
  contact.name
    .split(/\s+/)
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

const isBatch = (value: unknown): value is Batch =>
  typeof value === 'object' && value !== null && Array.isArray((value as Batch).contacts) && typeof (value as Batch).doneForToday === 'boolean'

function stopListening() {
  listener?.stop()
  listener = undefined
}

function reset() {
  keeping = false
  busy = false
  problem = ''
  draft = ''
  spoken = false
  stopListening()
}

/** A fresh batch from the server: what a new widget starts from. */
function start(next: Batch) {
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
  try {
    progress = (await run()).progress
    outcomes.set(contact.id, outcome)
    reset()
    render()
    // Tell the assistant what happened in the widget, so it doesn't offer the same contact again.
    if (!fake) void app.updateModelContext({ content: [{ type: 'text', text: said }] }).catch(() => {})
  } catch (error) {
    const message = error instanceof Error ? error.message : "That didn't save. Try again."
    await catchUp().catch(() => {})
    busy = false
    // If it turned out to be decided already, just move on to the next one.
    problem = outcomes.has(contact.id) ? '' : message
    if (outcomes.has(contact.id)) reset()
    render()
  }
}

function top(current: number) {
  const contacts = batch ?? []
  const today = current < contacts.length ? `Contact ${current + 1} of ${contacts.length} today` : 'Done for today'
  const overall = progress ? `${progress.decided} of ${progress.total} decided` : ''
  return h(
    'div',
    { class: 'top' },
    h('span', {}, today, overall && h('span', { class: 'overall' }, ` · ${overall}`)),
    h(
      'div',
      { class: 'dots', 'aria-hidden': 'true' },
      ...contacts.map((contact, i) => h('span', { class: `dot ${outcomes.get(contact.id)?.kind ?? (i === current ? 'now' : '')}` })),
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
          click: () =>
            void decide(contact, () => tools.letGo(contact.id), { kind: 'let_go' }, `I let ${contact.name} go in the widget. A copy is in the Brain.`),
        },
        'Let go',
      ),
      h(
        'button',
        {
          class: 'grow',
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
    h('p', { class: 'hint' }, 'Let go deletes them from your contacts, and from any phone synced to them. A copy stays in your Brain.'),
    h('p', { class: 'error', role: 'alert' }, problem),
  )
}

function gratitude(contact: Contact) {
  const box = h('textarea', { id: 'gratitude', maxlength: String(MAX_GRATITUDE), placeholder: 'She told me my writing was worth reading' })
  box.value = draft
  const error = h('p', { class: 'error', role: 'alert' }, problem)
  const status = h('span', {}, '')
  const mic = h('button', { type: 'button' }, 'Speak')

  box.addEventListener('input', () => {
    draft = box.value
    error.textContent = ''
    problem = ''
  })

  const stopped = (why?: string) => {
    listener = undefined
    mic.textContent = 'Speak'
    mic.classList.remove('listening')
    status.textContent = ''
    if (why) error.textContent = problem = why
  }

  mic.addEventListener('click', async () => {
    error.textContent = problem = ''
    if (listener) return stopListening()
    status.textContent = 'Checking the mic…'
    const blocked = await micProblem()
    status.textContent = ''
    if (blocked) {
      error.textContent = problem = blocked
      return
    }
    const before = box.value.trim()
    listener = listen({
      onText: (text) => {
        box.value = draft = `${before ? `${before} ` : ''}${text}`.slice(0, MAX_GRATITUDE)
        spoken = true
      },
      onStop: stopped,
    })
    if (!listener) return
    mic.textContent = 'Stop'
    mic.classList.add('listening')
    status.textContent = 'Listening…'
  })

  const save = () => {
    const text = box.value.trim()
    if (text.length < MIN_GRATITUDE) {
      error.textContent = problem = "Say what you're grateful for first"
      return
    }
    stopListening()
    void decide(
      contact,
      () => tools.keep(contact.id, text, spoken),
      { kind: 'kept', gratitude: text },
      `I kept ${contact.name} in the widget and said what I'm grateful for. It's saved in the Brain.`,
    )
  }

  return h(
    'div',
    {},
    h('label', { for: 'gratitude' }, `What are you grateful to ${firstName(contact)} for? Type it or say it.`),
    box,
    h('div', { class: 'voice' }, canListen ? mic : h('span', {}, BLOCKED), status),
    error,
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          click: () => {
            stopListening()
            keeping = false
            problem = ''
            render()
          },
        },
        'Back',
      ),
      h('button', { class: 'primary grow', 'aria-busy': String(busy), click: save }, 'Save and keep'),
    ),
  )
}

function done(contacts: Contact[]) {
  const kept = contacts.filter((contact) => outcomes.get(contact.id)?.kind === 'kept').length
  const letGo = contacts.filter((contact) => outcomes.get(contact.id)?.kind === 'let_go').length
  const line = (contact: Contact) => {
    const outcome = outcomes.get(contact.id)
    if (outcome?.kind === 'kept') return h('li', {}, `${contact.name}: `, h('span', { class: 'said' }, outcome.gratitude))
    return h('li', { class: 'gone' }, outcome?.kind === 'let_go' ? `${contact.name}, let go` : `${contact.name}, decided in the chat`)
  }
  return h(
    'div',
    { class: 'card' },
    h('p', { class: 'done-title' }, contacts.length ? `That's your ${contacts.length === 5 ? 'five' : 'lot'} for today` : "That's today done"),
    h('p', { class: 'done-body' }, contacts.length ? `${kept} kept with thanks, ${letGo} let go. More tomorrow.` : 'More contacts tomorrow.'),
    contacts.length > 0 && h('ul', { class: 'list' }, ...contacts.map(line)),
    !fake &&
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          { click: () => void app.sendMessage({ role: 'user', content: [{ type: 'text', text: 'Show me my Brain.' }] }).catch(() => {}) },
          'Read my Brain',
        ),
      ),
  )
}

function render() {
  if (!batch) {
    root.replaceChildren(h('div', { class: 'top' }, h('span', {}, problem || "Finding today's contacts…")))
    return
  }
  const current = batch.findIndex((contact) => !outcomes.has(contact.id))
  if (current < 0) {
    root.replaceChildren(top(batch.length), done(batch))
    return
  }
  const contact = batch[current]!
  const facts = h('div', { class: 'facts' }, ...[...contact.emails, ...contact.phones].map((fact) => h('div', {}, fact)))
  root.replaceChildren(top(current), h('div', { class: 'card' }, who(contact), facts, keeping ? gratitude(contact) : choose(contact)))
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
  app.onteardown = async () => {
    stopListening()
    return {}
  }
  app.onerror = console.error
  // Coming back to the chat after deciding out loud: drop anyone the assistant has already dealt with.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && batch && !busy && !keeping) void catchUp().then(render, () => {})
  })
  void app.connect().then(() => {
    const context = app.getHostContext()
    if (context) styleFromHost(context)
  })
}
