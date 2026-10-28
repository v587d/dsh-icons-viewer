import assert from 'node:assert/strict'
import test from 'node:test'
import { iconTable, renderReadme } from '../scripts/lib/readme.mjs'

const MARKERS = ['meta', 'recommended', 'regular', 'medium']

function emptyReadme() {
  const marker = (id) => `<!-- dsh-icons:begin ${id} -->\n<!-- dsh-icons:end ${id} -->`
  return ['# Icons', '', ...MARKERS.flatMap((id) => [marker(id), '']), 'footer', ''].join('\n')
}

const icons = [
  { name: 'IconAlphaRegular', weight: 'regular', file: 'icons/regular/IconAlphaRegular.svg' },
  { name: 'IconBetaMedium', weight: 'medium', file: 'icons/medium/IconBetaMedium.svg' },
]
const meta = { dshVersion: '1.0.0', primitivesVersion: '1.0.0', counts: { regular: 1, medium: 1, total: 2 } }
const recommended = { icons: [{ name: 'IconAlphaRegular', label: 'Common' }] }

test('renders compact tables with images, inline code and labels', () => {
  const output = renderReadme({ markdown: emptyReadme(), icons, meta, recommended })

  assert.match(output, /Source: `@deepseek-ai\/dsh-client-ui-primitives@1\.0\.0` · DSH `1\.0\.0` · 1 Regular \/ 1 Medium/)
  assert.ok(output.includes(
    '<td align="center"><img src="icons/regular/IconAlphaRegular.svg" width="24" height="24" '
    + 'alt="IconAlphaRegular"><br><code>IconAlphaRegular</code><br><sub>Common</sub></td>',
  ))
  assert.ok(output.includes(
    '<td align="center"><img src="icons/medium/IconBetaMedium.svg" width="24" height="24" '
    + 'alt="IconBetaMedium"><br><code>IconBetaMedium</code></td>',
  ))
  assert.equal((output.match(/<table>/g) ?? []).length, 3)
})

test('lays icons out three per row and pads short rows', () => {
  const output = renderReadme({ markdown: emptyReadme(), icons, meta, recommended })
  const rows = output.match(/<tr>.*?<\/tr>/g) ?? []
  assert.equal(rows.length, 3)
  for (const row of rows) assert.equal((row.match(/<td/g) ?? []).length, 3)
})

test('iconTable pads the last row with empty cells', () => {
  const four = [
    ...icons,
    { name: 'IconGammaRegular', weight: 'regular', file: 'icons/regular/IconGammaRegular.svg' },
    { name: 'IconDeltaMedium', weight: 'medium', file: 'icons/medium/IconDeltaMedium.svg' },
  ]
  const html = iconTable(four)
  assert.equal((html.match(/<tr>/g) ?? []).length, 2)
  assert.equal((html.match(/<td><\/td>/g) ?? []).length, 2)
})

test('does not put fenced code blocks inside tables', () => {
  const output = renderReadme({ markdown: emptyReadme(), icons, meta, recommended })
  for (const table of output.match(/<table>[\s\S]*?<\/table>/g) ?? []) {
    assert.ok(!table.includes('```'))
  }
})

test('every icon appears with an image and inline code', () => {
  const output = renderReadme({ markdown: emptyReadme(), icons, meta, recommended })
  for (const icon of icons) {
    assert.ok(output.includes(`alt="${icon.name}"`))
    assert.ok(output.includes(`<code>${icon.name}</code>`))
  }
})

test('keeps markers and is idempotent', () => {
  const once = renderReadme({ markdown: emptyReadme(), icons, meta, recommended })
  const twice = renderReadme({ markdown: once, icons, meta, recommended })
  assert.equal(once, twice)
  for (const id of MARKERS) {
    assert.equal(once.split(`<!-- dsh-icons:begin ${id} -->`).length - 1, 1)
    assert.equal(once.split(`<!-- dsh-icons:end ${id} -->`).length - 1, 1)
  }
})

test('fails on a missing marker', () => {
  const markdown = emptyReadme().replace('<!-- dsh-icons:begin regular -->\n<!-- dsh-icons:end regular -->\n', '')
  assert.throws(() => renderReadme({ markdown, icons, meta, recommended }), /marker pair/)
})

test('fails when a recommended icon no longer exists', () => {
  assert.throws(
    () => renderReadme({
      markdown: emptyReadme(),
      icons,
      meta,
      recommended: { icons: [{ name: 'IconGoneRegular' }] },
    }),
    /recommended icon does not exist/,
  )
})

test('fails when the recommended list is empty', () => {
  assert.throws(
    () => renderReadme({ markdown: emptyReadme(), icons, meta, recommended: { icons: [] } }),
    /recommended list is empty/,
  )
})

test('fails when meta counts are stale', () => {
  assert.throws(
    () => renderReadme({
      markdown: emptyReadme(),
      icons,
      meta: { ...meta, counts: { regular: 9, medium: 9, total: 18 } },
      recommended,
    }),
    /counts do not match/,
  )
})
