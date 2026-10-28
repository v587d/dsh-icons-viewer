import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { renderReadme } from '../scripts/lib/readme.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const readJson = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'))

const data = readJson('data/icons.json')
const meta = readJson('data/meta.json')
const recommended = readJson('data/recommended.json')
const readme = readFileSync(join(root, 'README.md'), 'utf8')

test('icons.json matches meta.json counts and the svg files on disk', () => {
  assert.equal(data.icons.length, meta.counts.total)
  assert.equal(meta.counts.regular, data.icons.filter((icon) => icon.weight === 'regular').length)
  assert.equal(meta.counts.medium, data.icons.filter((icon) => icon.weight === 'medium').length)
  assert.equal(meta.primitivesVersion, data.version)

  for (const icon of data.icons) {
    const svg = readFileSync(join(root, icon.file), 'utf8')
    assert.match(svg, /^<svg\b/)
    assert.match(svg, /viewBox="/)
    assert.match(svg, /^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    assert.match(svg, /^<svg[^>]*\bwidth="24"[^>]*\bheight="24"/)
    assert.ok(!svg.includes('currentColor'), icon.name)
    assert.ok(!svg.includes('undefined'), icon.name)
    assert.ok(!svg.includes('[object Object]'), icon.name)
    assert.ok(!svg.includes('mask-units'), icon.name)
  }

  const files = ['regular', 'medium']
    .flatMap((weight) => readdirSync(join(root, 'icons', weight)).map((file) => `icons/${weight}/${file}`))
    .sort()
  assert.deepEqual(files, data.icons.map((icon) => icon.file).sort())
})

test('README is exactly what the renderer produces from committed data', () => {
  assert.equal(
    renderReadme({ markdown: readme, icons: data.icons, meta, recommended }),
    readme,
  )
})

test('every icon has a copyable code block', () => {
  for (const icon of data.icons) {
    assert.ok(readme.includes(`\`\`\`ts\n${icon.name}\n\`\`\``), `missing code block: ${icon.name}`)
  }
})

test('recommended icons all exist and are regular weight', () => {
  const byName = new Map(data.icons.map((icon) => [icon.name, icon]))
  for (const entry of recommended.icons) {
    const icon = byName.get(entry.name)
    assert.ok(icon, `recommended icon missing: ${entry.name}`)
    assert.equal(icon.weight, 'regular')
  }
})

test('no generated <img> is followed by a table row', () => {
  assert.ok(!/\| !\[\]\(icons\//.test(readme))
  assert.ok(!/\|<img/.test(readme))
})

test('committed icons directory exists', () => {
  assert.ok(existsSync(join(root, 'icons', 'regular')))
  assert.ok(existsSync(join(root, 'icons', 'medium')))
})
