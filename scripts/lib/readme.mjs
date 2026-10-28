/**
 * Renders the generated regions of README.md. Everything outside the
 * `<!-- dsh-icons:begin ID -->` / `<!-- dsh-icons:end ID -->` pairs is hand-written.
 *
 * Icons are laid out as an HTML table: GitHub does not allow fenced code
 * blocks inside table cells, so each variable name is inline code and can be
 * copied by double-clicking it.
 */

const COLUMNS = 3

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]))
}

export function iconTable(icons, labels = new Map()) {
  if (!Array.isArray(icons) || icons.length === 0) throw new Error('no icons to render')

  const rows = []
  for (let index = 0; index < icons.length; index += COLUMNS) {
    const slice = icons.slice(index, index + COLUMNS)
    const cells = slice.map((icon) => {
      const label = labels.get(icon.name)
      const caption = label ? `<br><sub>${escapeHtml(label)}</sub>` : ''
      return `<td align="center"><img src="${escapeHtml(icon.file)}" width="24" height="24" alt="${escapeHtml(icon.name)}"><br><code>${escapeHtml(icon.name)}</code>${caption}</td>`
    }).join('')
    rows.push(`<tr>${cells}${'<td></td>'.repeat(COLUMNS - slice.length)}</tr>`)
  }

  return ['<table>', '<tbody>', ...rows, '</tbody>', '</table>'].join('\n')
}

export function replaceMarkerSection(markdown, id, body) {
  const begin = `<!-- dsh-icons:begin ${id} -->`
  const end = `<!-- dsh-icons:end ${id} -->`
  const beginCount = markdown.split(begin).length - 1
  const endCount = markdown.split(end).length - 1
  if (beginCount !== 1 || endCount !== 1) {
    throw new Error(`expected exactly one "${id}" marker pair, found ${beginCount} begin / ${endCount} end`)
  }
  const start = markdown.indexOf(begin)
  const stop = markdown.indexOf(end)
  if (stop < start) throw new Error(`"${id}" end marker appears before its begin marker`)
  return `${markdown.slice(0, start + begin.length)}\n${body}\n\n${markdown.slice(stop)}`
}

export function renderReadme({ markdown, icons, meta, recommended = [] }) {
  if (!Array.isArray(icons) || icons.length === 0) throw new Error('no icons to render')
  const names = new Set(icons.map((icon) => icon.name))
  if (names.size !== icons.length) throw new Error('duplicate icon names in icons.json')

  const regular = icons.filter((icon) => icon.weight === 'regular')
  const medium = icons.filter((icon) => icon.weight === 'medium')
  if (regular.length === 0 || medium.length === 0) {
    throw new Error(`expected both Regular and Medium icons, got ${regular.length}/${medium.length}`)
  }

  if (typeof meta?.dshVersion !== 'string' || typeof meta?.primitivesVersion !== 'string') {
    throw new Error('meta.json is missing dshVersion/primitivesVersion')
  }
  if (meta.counts) {
    const stale = meta.counts.regular !== regular.length
      || meta.counts.medium !== medium.length
      || meta.counts.total !== icons.length
    if (stale) throw new Error('meta.json counts do not match data/icons.json')
  }

  const byName = new Map(icons.map((icon) => [icon.name, icon]))
  const recommendedIcons = (recommended.icons ?? []).map((entry) => {
    const icon = byName.get(entry.name)
    if (!icon) throw new Error(`recommended icon does not exist in icons.json: ${entry.name}`)
    return { icon, label: entry.label }
  })
  if (recommendedIcons.length === 0) throw new Error('recommended list is empty')

  const labels = new Map(recommendedIcons.map(({ icon, label }) => [icon.name, label]))
  const metaLine = `Source: \`@deepseek-ai/dsh-client-ui-primitives@${meta.primitivesVersion}\` · DSH \`${meta.dshVersion}\` · ${regular.length} Regular / ${medium.length} Medium`
  const bodies = {
    meta: metaLine,
    recommended: iconTable(recommendedIcons.map(({ icon }) => icon), labels),
    regular: iconTable(regular),
    medium: iconTable(medium),
  }
  for (const [id, body] of Object.entries(bodies)) {
    if (body === '') throw new Error(`refusing to render an empty "${id}" section`)
  }

  let output = markdown
  for (const id of ['meta', 'recommended', 'regular', 'medium']) {
    output = replaceMarkerSection(output, id, bodies[id])
  }
  return output
}
