#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeIfChanged } from './lib/fs.mjs'
import { renderReadme } from './lib/readme.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

try {
  const icons = JSON.parse(readFileSync(join(root, 'data/icons.json'), 'utf8'))
  const meta = JSON.parse(readFileSync(join(root, 'data/meta.json'), 'utf8'))
  const recommended = JSON.parse(readFileSync(join(root, 'data/recommended.json'), 'utf8'))
  const readmePath = join(root, 'README.md')
  const rendered = renderReadme({
    markdown: readFileSync(readmePath, 'utf8'),
    icons: icons.icons,
    meta,
    recommended,
  })
  const changed = writeIfChanged(readmePath, rendered)
  console.log(changed ? 'updated README.md' : 'README.md is up to date')
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
