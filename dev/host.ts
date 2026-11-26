// A tiny stand-in for Claude, for looking at the widget locally. It is not part of the deployed Worker.
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'

const WIDGET_URI = 'ui://day19/contacts.html'
const frame = document.getElementById('view') as HTMLIFrameElement
const log = document.getElementById('log')!
const note = (line: string) => (log.textContent = `${line}\n${log.textContent}`.slice(0, 2000))

const client = new Client({ name: 'day19-local-host', version: '0.0.0' })
await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', location.href)))

let bridge: AppBridge | undefined

async function run(tool: string) {
  await bridge?.close()
  const resource = await client.readResource({ uri: WIDGET_URI })
  const html = resource.contents[0] && 'text' in resource.contents[0] ? resource.contents[0].text : ''
  const loaded = new Promise((resolve) => frame.addEventListener('load', resolve, { once: true }))
  frame.srcdoc = html
  await loaded

  bridge = new AppBridge(client, { name: 'day19-local-host', version: '0.0.0' }, { serverTools: {}, updateModelContext: { text: {} } })
  const ready = new Promise<void>((resolve) => (bridge!.oninitialized = () => resolve()))
  bridge.onsizechange = ({ height }) => {
    if (height) frame.style.height = `${height}px`
  }
  bridge.onupdatemodelcontext = async ({ content }) => {
    note(`model context: ${content?.map((block) => (block.type === 'text' ? block.text : block.type)).join(' ')}`)
    return {}
  }
  bridge.onmessage = async ({ content }) => {
    note(`message to chat: ${content.map((block) => (block.type === 'text' ? block.text : block.type)).join(' ')}`)
    return {}
  }
  await bridge.connect(new PostMessageTransport(frame.contentWindow!, frame.contentWindow!))
  await ready
  await bridge.sendToolInput({ arguments: {} })
  await bridge.sendToolResult(await client.callTool({ name: tool, arguments: {} }))
  note(`called ${tool}`)
}

document.getElementById('open')!.addEventListener('click', () => void run('todays_contacts'))
document.getElementById('reset')!.addEventListener('click', () => void run('reset_demo'))
void run('todays_contacts')
