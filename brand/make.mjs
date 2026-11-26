// Draws every Gobbler logo file from one turkey, in the landing page's colours.
// Run from the repo root: node brand/make.mjs. Then brand/render.sh turns them into PNGs and the favicon.
import { readFileSync, writeFileSync } from 'node:fs'

export const COLOURS = { feather: '#E9573B', tip: '#F7B9A6', line: '#4A1410', body: '#FFF4E6', cream: '#FFF4E6' }

// The tail: four rounded feathers side by side, fanning from behind the back up to the head, a little taller than a
// half circle. The same shape as the widget's done screen (workers/mcp/widget/src/main.ts).
const TIPS = ['M40 52L5.5 58.1A11.4 11.4 0 0 1 8.2 37.5Z', 'M40 52L8.2 37.5A11.4 11.4 0 0 1 22 22Z', 'M40 52L22 22A11.4 11.4 0 0 1 42.1 17.1Z', 'M40 52L42.1 17.1A11.4 11.4 0 0 1 61.5 24.4Z']
const VANES = ['M40 52L10.9 57.1A9.6 9.6 0 0 1 13.2 39.8Z', 'M40 52L13.2 39.8A9.6 9.6 0 0 1 24.8 26.7Z', 'M40 52L24.8 26.7A9.6 9.6 0 0 1 41.8 22.6Z', 'M40 52L41.8 22.6A9.6 9.6 0 0 1 58.2 28.8Z']

/** The turkey's insides. `c` maps each part to a colour, a CSS value like var(--tk-line,#4A1410) works too. */
export function turkey(c = COLOURS) {
  const gap = `stroke="${c.gap ?? c.cream}" stroke-width="1.6" stroke-linejoin="round"`
  return `<g transform="translate(0 52) scale(1 1.25) translate(0 -52)">
${TIPS.map((d) => `  <path fill="${c.tip}" ${gap} d="${d}"/>`).join('\n')}
${VANES.map((d) => `  <path fill="${c.feather}" ${gap} d="${d}"/>`).join('\n')}
</g>
<path fill="none" stroke="${c.line}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M38 66v6M50 66v6M34 72h8M46 72h8"/>
<circle fill="${c.body}" stroke="${c.line}" stroke-width="2.5" cx="44" cy="50" r="17"/>
<path fill="none" stroke="${c.line}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" d="M34 50c2 8 12 9 16 2"/>
<path fill="none" stroke="${c.body}" stroke-width="9" stroke-linecap="round" d="M56 46c4-4 6-9 6-14"/>
<circle fill="${c.body}" stroke="${c.line}" stroke-width="2.5" cx="63" cy="28" r="8"/>
<circle fill="${c.line}" cx="65.5" cy="26" r="1.6"/>
<path fill="${c.feather}" d="M70 25l9 3-9 1zM70 29l8 0-8 3z"/>
<path fill="${c.feather}" d="M69 32c3 0 4 3 2 6-2 0-3-3-2-6z"/>`
}

// Square framings. Logos get breathing room; the favicon fills its square.
const LOGO_BOX = [-9, -13, 100, 100]
const ICON_BOX = [1, -3, 82, 82]
const svg = (box, inner, bg) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(' ')}">\n<title>Gobbler</title>\n${bg ? `<rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" fill="${bg}"/>\n` : ''}${inner}\n</svg>\n`

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync('brand/gobbler-logo.svg', svg(LOGO_BOX, turkey(), COLOURS.cream))
  writeFileSync('brand/gobbler-logo-transparent.svg', svg(LOGO_BOX, turkey({ ...COLOURS, gap: COLOURS.cream })))
  writeFileSync('workers/mcp/landing/turkey.svg', svg(ICON_BOX, turkey()))
  // The landing page draws the turkey inline so its header can recolour it. CSS variables only work in style=, not in
  // SVG attributes, so every presentation attribute moves into a style.
  const themed = turkey({ feather: 'var(--tk-keep,#E9573B)', tip: 'var(--tk-tip,#F7B9A6)', line: 'var(--tk-line,#4A1410)', body: 'var(--tk-body,#FFF4E6)', gap: 'var(--tk-gap,#FFF4E6)' })
    .replace(/<(\w+)((?: [\w-]+="[^"]*")+)\/>/g, (_, tag, attrs) => {
      const style = [], keep = []
      for (const [, k, v] of attrs.matchAll(/ ([\w-]+)="([^"]*)"/g)) (/^(fill|stroke|stroke-[\w-]+)$/.test(k) ? style : keep).push(/^(fill|stroke|stroke-[\w-]+)$/.test(k) ? `${k}:${v}` : ` ${k}="${v}"`)
      return `<${tag} style="${style.join(';')}"${keep.join('')}></${tag}>`
    })
  const page = 'workers/mcp/landing/index.html'
  const html = readFileSync(page, 'utf8')
  const symbol = /<symbol id="turkey" viewBox="[^"]*">[\s\S]*?<\/symbol>/
  if (!symbol.test(html)) throw new Error(`no turkey symbol in ${page}`)
  writeFileSync(page, html.replace(symbol, `<symbol id="turkey" viewBox="${ICON_BOX.join(' ')}">\n${themed}\n</symbol>`))
  console.log('wrote brand/*.svg workers/mcp/landing/turkey.svg and the turkey in workers/mcp/landing/index.html')
}
