import assert from 'node:assert/strict'
import test from 'node:test'
import { renderReadme } from '../scripts/lib/readme.mjs'

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
const recommended = { icons: [{ name: 'IconAlphaRegular', label: '常用' }] }

test('renders icon blocks with images and copyable ts blocks', () => {
  const output = renderReadme({ markdown: emptyReadme(), icons, meta, recommended })

  assert.match(output, /来源：`@deepseek-ai\/dsh-client-ui-primitives@1\.0\.0` · DSH `1\.0\.0` · 1 Regular \/ 1 Medium/)
  assert.ok(output.includes(
    '<img src="icons/regular/IconAlphaRegular.svg" width="24" height="24" alt="IconAlphaRegular">\n\n'
    + '```ts\nIconAlphaRegular\n```',
  ))
  assert.ok(output.includes(
    '<img src="icons/medium/IconBetaMedium.svg" width="24" height="24" alt="IconBetaMedium">\n\n'
    + '```ts\nIconBetaMedium\n```',
  ))
  assert.ok(output.includes('*常用*'))
})

test('every icon gets exactly one code block outside the recommended section', () => {
  const output = renderReadme({ markdown: emptyReadme(), icons, meta, recommended })
  const blocks = [...output.matchAll(/```ts\n(Icon[A-Za-z0-9]+)\n```/g)].map((match) => match[1])
  assert.equal(blocks.length, icons.length + recommended.icons.length)
  assert.deepEqual([...new Set(blocks)].sort(), icons.map((icon) => icon.name).sort())
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
