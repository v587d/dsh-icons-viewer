import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Writes a file only when its contents actually change, so a no-op sync leaves
 * mtimes (and `git status`) untouched.
 */
export function writeIfChanged(filePath, contents) {
  try {
    if (readFileSync(filePath, 'utf8') === contents) return false
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, contents)
  return true
}
