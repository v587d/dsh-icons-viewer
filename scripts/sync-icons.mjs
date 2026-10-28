#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractIcons } from './lib/extract.mjs'
import { writeIfChanged } from './lib/fs.mjs'
import { renderReadme } from './lib/readme.mjs'
import { downloadPrimitives, resolveSource } from './lib/source.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const channel = process.env.DSH_CHANNEL?.trim() || 'next'
const pinned = process.env.DSH_VERSION?.trim() || ''

try {
  const source = await resolveSource({ channel, dshVersion: pinned })
  console.log(
    `dsh ${source.dshVersion} -> web-frontend ${source.frontendVersion} `
    + `-> primitives ${source.primitivesVersion}`,
  )

  const packageDir = await downloadPrimitives(source, join(root, '.cache'))
  const { version, icons, counts } = extractIcons({ packageDir, outDir: root })
  console.log(
    `extracted ${counts.regular} regular + ${counts.medium} medium = ${icons.length} icons `
    + `from primitives ${version}`,
  )

  const meta = {
    dshVersion: source.dshVersion,
    frontendVersion: source.frontendVersion,
    primitivesVersion: version,
    counts: { ...counts, total: icons.length },
  }
  const metaChanged = writeIfChanged(join(root, 'data/meta.json'), JSON.stringify(meta, null, 2) + '\n')

  const recommended = JSON.parse(readFileSync(join(root, 'data/recommended.json'), 'utf8'))
  const readmePath = join(root, 'README.md')
  const rendered = renderReadme({
    markdown: readFileSync(readmePath, 'utf8'),
    icons,
    meta,
    recommended,
  })
  const readmeChanged = writeIfChanged(readmePath, rendered)

  console.log(
    metaChanged || readmeChanged
      ? 'updated data/meta.json and/or README.md'
      : 'data/meta.json and README.md are up to date',
  )
} catch (error) {
  console.error(`sync failed: ${error.message}`)
  process.exit(1)
}
