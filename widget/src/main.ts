import { App, applyDocumentTheme, applyHostFonts, applyHostStyleVariables, type McpUiHostContext } from '@modelcontextprotocol/ext-apps'

import { MAX_GRATITUDE, MIN_GRATITUDE, type Today, type TodayCard } from '../../src/game'
import './style.css'
import { BLOCKED, canListen, listen, type Listener } from './voice'

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

const root = document.getElementById('app')!
const app = new App({ name: 'Day 19 contacts', version: '0.1.0' })

let today: Today | undefined
let keeping = false
let busy = false
let problem = ''
let draft = ''
let spoken = false
let listener: Listener | undefined

const firstName = (contact: TodayCard) => contact.name.split(' ')[0] ?? contact.name
const initials = (contact: TodayCard) =>
  contact.name
    .split(/\s+/)
    .map((word) => word[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()

const isToday = (value: unknown): value is Today =>
  typeof value === 'object' && value !== null && Array.isArray((value as Today).contacts) && typeof (value as Today).date === 'string'

function stopListening() {
  listener?.stop()
  listener = undefined
}

function show(next: Today) {
  today = next
  keeping = false
  busy = false
  problem = ''
  draft = ''
  spoken = false
  stopListening()
  render()
}

/** Every decision goes through the server, which answers with the day as it now stands. */
async function decide(name: string, args: Record<string, unknown>, said: string) {
  if (busy) return
  busy = true
  problem = ''
  render()
  try {
    const result = await app.callServerTool({ name, arguments: args })
    if (result.isError || !isToday(result.structuredContent)) {
      const block = result.content?.find((item) => item.type === 'text')
      throw new Error(block?.type === 'text' ? block.text : 'That didn\'t save. Try again.')
    }
    show(result.structuredContent)
    // Tell the assistant what happened in the widget, so it doesn't offer the same contact again.
    void app.updateModelContext({ content: [{ type: 'text', text: said }] }).catch(() => {})
  } catch (error) {
    busy = false
    problem = error instanceof Error ? error.message : 'That didn\'t save. Try again.'
    render()
  }
}

function top(current: number) {
  const contacts = today?.contacts ?? []
  const left = contacts.length - current
  return h(
    'div',
    { class: 'top' },
    h('span', {}, left > 0 ? `Contact ${current + 1} of ${contacts.length} today` : 'Done for today'),
    h(
      'div',
      { class: 'dots', 'aria-hidden': 'true' },
      ...contacts.map((contact, i) => h('span', { class: `dot ${contact.decision?.kind ?? (i === current ? 'now' : '')}` })),
    ),
  )
}

function who(contact: TodayCard) {
  return h(
    'div',
    { class: 'who' },
    h('div', { class: 'avatar', 'aria-hidden': 'true' }, initials(contact)),
    h('div', {}, h('p', { class: 'name' }, contact.name), contact.detail ? h('p', { class: 'detail' }, contact.detail) : false),
  )
}

function choose(contact: TodayCard) {
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
          click: () => void decide('delete_contact', { contact_id: contact.id }, `I deleted ${contact.name} in the widget. A copy is in the Brain.`),
        },
        'Delete',
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
    h('p', { class: 'hint' }, 'Delete removes them from your contacts. A copy stays in your Brain.'),
    h('p', { class: 'error', role: 'alert' }, problem),
  )
}

function gratitude(contact: TodayCard) {
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

  mic.addEventListener('click', () => {
    error.textContent = problem = ''
    if (listener) return stopListening()
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
      'keep_contact',
      { contact_id: contact.id, gratitude: text, spoken },
      `I kept ${contact.name} in the widget and said what I'm grateful for. It's saved in the Brain.`,
    )
  }

  return h(
    'div',
    {},
    h('label', { for: 'gratitude' }, `What are you grateful to ${firstName(contact)} for? Type it or say it.`),
    box,
    h('div', { class: 'voice' }, mic, status, !canListen && h('span', {}, BLOCKED)),
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

function done(contacts: TodayCard[]) {
  const kept = contacts.filter((contact) => contact.decision?.kind === 'kept').length
  return h(
    'div',
    { class: 'card' },
    h('p', { class: 'done-title' }, contacts.length ? "That's your five" : 'Nobody left to go through'),
    h(
      'p',
      { class: 'done-body' },
      contacts.length ? `${kept} kept with thanks, ${contacts.length - kept} let go. Five more tomorrow.` : 'Every contact has been decided.',
    ),
    contacts.length > 0 &&
      h(
        'ul',
        { class: 'list' },
        ...contacts.map((contact) =>
          contact.decision?.kind === 'kept'
            ? h('li', {}, `${contact.name}: `, h('span', { class: 'said' }, contact.decision.gratitude))
            : h('li', { class: 'gone' }, `${contact.name}, let go`),
        ),
      ),
    h(
      'div',
      { class: 'row' },
      h(
        'button',
        {
          click: () =>
            void app.sendMessage({ role: 'user', content: [{ type: 'text', text: 'Show me my Brain.' }] }).catch(() => {}),
        },
        'Read my Brain',
      ),
    ),
  )
}

function render() {
  if (!today) {
    root.replaceChildren(h('div', { class: 'top' }, h('span', {}, 'Finding today\'s contacts…')))
    return
  }
  const { contacts } = today
  const current = contacts.findIndex((contact) => !contact.decision)
  if (current < 0) {
    root.replaceChildren(top(contacts.length), done(contacts))
    return
  }
  const contact = contacts[current]!
  const facts = h('div', { class: 'facts' }, contact.email ? h('div', {}, contact.email) : false, contact.phone ? h('div', {}, contact.phone) : false)
  root.replaceChildren(top(current), h('div', { class: 'card' }, who(contact), facts, keeping ? gratitude(contact) : choose(contact)))
}

function styleFromHost(context: McpUiHostContext) {
  if (context.theme) applyDocumentTheme(context.theme)
  if (context.styles?.variables) applyHostStyleVariables(context.styles.variables)
  if (context.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts)
}

app.ontoolresult = (result) => {
  if (isToday(result.structuredContent)) show(result.structuredContent)
}
app.onhostcontextchanged = styleFromHost
app.onteardown = async () => {
  stopListening()
  return {}
}
app.onerror = console.error

render()
void app.connect().then(() => {
  const context = app.getHostContext()
  if (context) styleFromHost(context)
})
