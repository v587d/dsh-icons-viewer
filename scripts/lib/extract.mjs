import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { writeIfChanged } from './fs.mjs'

/**
 * Extracts every icon component from an extracted @deepseek-ai/dsh-client-ui-primitives
 * tarball into standalone SVG files plus data/icons.json.
 *
 * The parser depends on the package's internal `//#region` markers and the shape
 * of lib/types/icons/index.d.ts. If either changes, this module throws instead of
 * emitting a partial icon set -- the scheduled workflow relies on that canary.
 */

const REGION_START = '//#region lib/types/icons/shared-artwork.js'
const REGION_END = '//#region lib/types/StateDot.js'
const DECLARATION = /export declare const (Icon[A-Za-z0-9]+(?:Regular|Medium))\s*:/g
const ICON_COLOR = '#8b949e'

export function readIconNames(declarations) {
  const found = [...declarations.matchAll(DECLARATION)].map((match) => match[1])
  if (found.length === 0) {
    throw new Error('no icon declarations found in lib/types/icons/index.d.ts; the package shape changed')
  }
  const unique = [...new Set(found)].sort()
  if (unique.length !== found.length) {
    throw new Error('duplicate icon declarations found; refusing to guess which one wins')
  }
  return unique
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]))
}

function attributeName(name) {
  if (name === 'className') return 'class'
  if (name === 'htmlFor') return 'for'
  if (name === 'viewBox' || name === 'xmlns' || name === 'aria-hidden') return name
  return name.replace(/[A-Z]/g, (char) => '-' + char.toLowerCase())
}

function renderNode(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (Array.isArray(node)) return node.map(renderNode).join('')
  if (typeof node === 'string' || typeof node === 'number') return escapeHtml(node)

  const { type, props } = node
  if (typeof type === 'function') return renderNode(type(props ?? {}))
  if (typeof type !== 'string') return ''

  const attributes = []
  for (const [key, value] of Object.entries(props ?? {})) {
    if (key === 'children' || key === 'key' || key === 'ref') continue
    if (value === null || value === undefined || value === false) continue
    if (key === 'dangerouslySetInnerHTML') {
      return `<${type}${attributes.join('')}>${value.__html ?? ''}</${type}>`
    }
    if (key === 'style' && typeof value === 'object') {
      const style = Object.entries(value)
        .map(([property, styleValue]) => `${property.replace(/[A-Z]/g, (char) => '-' + char.toLowerCase())}:${styleValue}`)
        .join(';')
      attributes.push(` style="${escapeHtml(style)}"`)
      continue
    }
    attributes.push(` ${attributeName(key)}="${escapeHtml(value)}"`)
  }
  return `<${type}${attributes.join('')}>${renderNode(props?.children)}</${type}>`
}

/**
 * README <img> files cannot inherit currentColor from GitHub's page theme.
 * A neutral gray stays visible in both light and dark themes. Width/height are
 * pinned to 24px; nested width attributes (e.g. masks) are left alone.
 */
export function normalizeSvg(svg) {
  let output = svg.replaceAll('currentColor', ICON_COLOR)
  const tagEnd = output.indexOf('>')
  if (tagEnd < 0) throw new Error('rendered icon has no svg tag')
  const openTag = output
    .slice(0, tagEnd)
    .replace(/\bwidth="[^"]*"/, 'width="24"')
    .replace(/\bheight="[^"]*"/, 'height="24"')
  return openTag + output.slice(tagEnd)
}

function assertSvg(name, svg) {
  if (!svg.startsWith('<svg') || !svg.endsWith('</svg>')) {
    throw new Error(`icon did not render as a complete svg: ${name}`)
  }
  if (!/\bviewBox="/.test(svg)) throw new Error(`icon is missing viewBox: ${name}`)
  if (!/^<svg[^>]*\bwidth="24"/.test(svg) || !/^<svg[^>]*\bheight="24"/.test(svg)) {
    throw new Error(`icon is missing a 24px width/height: ${name}`)
  }
  if (svg.includes('undefined') || svg.includes('[object Object]')) {
    throw new Error(`icon output contains unresolved values: ${name}`)
  }
  if (svg.includes('currentColor')) {
    throw new Error(`icon output still contains currentColor: ${name}`)
  }
}

function loadComponents(region, names) {
  const runtime = `
let __iconUid = 0
const useId = () => 'icon-' + (++__iconUid)
const jsx = (type, props) => ({ type, props: props ?? {} })
const jsxs = jsx
function __resetUid() { __iconUid = 0 }
`
  return new Function(`${runtime}\n${region}\nreturn { ${names.join(', ')}, __resetUid }`)()
}

/**
 * @param {{ packageDir: string, outDir: string }} options
 * @returns {{ version: string, icons: Array<{name: string, weight: string, file: string}>, counts: {regular: number, medium: number} }}
 */
export function extractIcons({ packageDir, outDir }) {
  const indexJs = readFileSync(join(packageDir, 'lib/index.js'), 'utf8')
  const declarations = readFileSync(join(packageDir, 'lib/types/icons/index.d.ts'), 'utf8')
  const version = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')).version
  if (typeof version !== 'string' || version === '') {
    throw new Error('primitives package.json has no version')
  }

  const names = readIconNames(declarations)

  const start = indexJs.indexOf(REGION_START)
  const end = indexJs.indexOf(REGION_END, start)
  if (start < 0 || end < 0) {
    throw new Error('icon region markers not found; update the extractor for this package format')
  }
  const region = indexJs.slice(start, end)
  if (region.trim() === '') throw new Error('icon region is empty; refusing to continue')

  const components = loadComponents(region, names)

  // Render everything before touching the output directory, so a format change
  // fails without leaving a half-written icon set behind.
  const rendered = []
  for (const name of names) {
    const component = components[name]
    if (typeof component !== 'function') throw new Error(`declaration has no component: ${name}`)

    components.__resetUid()
    const raw = renderNode(component({ size: 24 }))
    if (!raw.startsWith('<svg') || !raw.endsWith('</svg>')) {
      throw new Error(`icon did not render as a complete svg: ${name}`)
    }
    const svg = normalizeSvg(raw)
    assertSvg(name, svg)

    const weight = name.endsWith('Medium') ? 'medium' : 'regular'
    rendered.push({ name, weight, file: `icons/${weight}/${name}.svg`, svg })
  }

  const counts = {
    regular: rendered.filter((icon) => icon.weight === 'regular').length,
    medium: rendered.filter((icon) => icon.weight === 'medium').length,
  }
  if (counts.regular === 0 || counts.medium === 0) {
    throw new Error(`expected both Regular and Medium icons, got ${counts.regular}/${counts.medium}`)
  }

  rmSync(join(outDir, 'icons', 'regular'), { recursive: true, force: true })
  rmSync(join(outDir, 'icons', 'medium'), { recursive: true, force: true })
  for (const icon of rendered) {
    mkdirSync(join(outDir, 'icons', icon.weight), { recursive: true })
    writeFileSync(join(outDir, icon.file), icon.svg)
  }

  const icons = rendered.map(({ name, weight, file }) => ({ name, weight, file }))
  writeIfChanged(join(outDir, 'data/icons.json'), JSON.stringify({ version, icons }, null, 2) + '\n')

  return { version, icons, counts }
}
