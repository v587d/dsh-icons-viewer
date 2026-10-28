#!/usr/bin/env node
import { resolve } from 'node:path'
import { extractIcons } from './lib/extract.mjs'

const packageDir = process.argv[2]
const outDir = process.argv[3] ?? 'generated'

if (!packageDir) {
  console.error('usage: node scripts/extract-icons.mjs <extracted-primitives-dir> [out-dir]')
  process.exit(1)
}

try {
  const result = extractIcons({ packageDir: resolve(packageDir), outDir: resolve(outDir) })
  console.log(
    `extracted ${result.icons.length} icons (${result.counts.regular} regular, ${result.counts.medium} medium) `
    + `from primitives ${result.version} -> ${resolve(outDir)}`,
  )
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
