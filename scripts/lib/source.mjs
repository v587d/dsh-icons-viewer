import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Resolves the primitives version through the published dependency chain:
 *
 *   @deepseek-ai/dsh@<channel> -> @deepseek-ai/dsh-web-app@V
 *     -> @deepseek-ai/dsh-web-frontend@F
 *     -> @deepseek-ai/dsh-client-ui-primitives@P
 *
 * `latest` is deliberately not a default: for these packages it points at an
 * old RC. Use `next`, or pin DSH_VERSION explicitly.
 */

export const DEFAULT_CHANNEL = 'next'
export const NPM_REGISTRY = (process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org').replace(/\/$/, '')

export const DSH_PACKAGE = '@deepseek-ai/dsh'
export const WEB_APP_PACKAGE = '@deepseek-ai/dsh-web-app'
export const WEB_FRONTEND_PACKAGE = '@deepseek-ai/dsh-web-frontend'
export const PRIMITIVES_PACKAGE = '@deepseek-ai/dsh-client-ui-primitives'

export function createRegistry({ registry = NPM_REGISTRY, fetchImpl = fetch } = {}) {
  return {
    async manifest(name, ref) {
      const path = `${name.replace('/', '%2F')}/${ref}`
      const url = `${registry}/${path}`
      const response = await fetchImpl(url, { headers: { accept: 'application/json' } })
      if (!response.ok) {
        throw new Error(`npm registry: ${name}@${ref} -> HTTP ${response.status} (${url})`)
      }
      const body = await response.json()
      if (body === null || typeof body !== 'object' || typeof body.version !== 'string') {
        throw new Error(`npm registry: ${name}@${ref} returned an unexpected manifest`)
      }
      return body
    },
  }
}

export function requireExactVersion(range, label) {
  if (typeof range !== 'string' || range.trim() === '') {
    throw new Error(`${label} is missing`)
  }
  const value = range.trim()
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value)) {
    throw new Error(`${label} is not an exact version: ${range}`)
  }
  return value
}

export async function resolveSource({
  channel = DEFAULT_CHANNEL,
  dshVersion = '',
  registry = createRegistry(),
} = {}) {
  const pinned = String(dshVersion).trim()
  const dsh = pinned
    ? await registry.manifest(DSH_PACKAGE, pinned)
    : await registry.manifest(DSH_PACKAGE, channel)
  const resolvedDsh = dsh.version
  if (pinned && resolvedDsh !== pinned) {
    throw new Error(`npm registry returned ${DSH_PACKAGE}@${resolvedDsh} for pinned ${pinned}`)
  }

  const webApp = await registry.manifest(WEB_APP_PACKAGE, resolvedDsh)
  const frontendVersion = requireExactVersion(
    webApp.dependencies?.[WEB_FRONTEND_PACKAGE],
    `${WEB_APP_PACKAGE}@${resolvedDsh} dependency ${WEB_FRONTEND_PACKAGE}`,
  )

  const frontend = await registry.manifest(WEB_FRONTEND_PACKAGE, frontendVersion)
  const primitivesRange = frontend.devDependencies?.[PRIMITIVES_PACKAGE]
    ?? frontend.dependencies?.[PRIMITIVES_PACKAGE]
  const primitivesVersion = requireExactVersion(
    primitivesRange,
    `${WEB_FRONTEND_PACKAGE}@${frontendVersion} dependency ${PRIMITIVES_PACKAGE}`,
  )

  const manifest = await registry.manifest(PRIMITIVES_PACKAGE, primitivesVersion)
  if (manifest.version !== primitivesVersion) {
    throw new Error(`resolved ${PRIMITIVES_PACKAGE}@${primitivesVersion}, registry returned ${manifest.version}`)
  }
  if (typeof manifest.dist?.tarball !== 'string' || typeof manifest.dist?.integrity !== 'string') {
    throw new Error(`${PRIMITIVES_PACKAGE}@${primitivesVersion} manifest has no dist.tarball/dist.integrity`)
  }

  return {
    dshVersion: resolvedDsh,
    frontendVersion,
    primitivesVersion,
    manifest,
  }
}

export function verifyIntegrity(buffer, integrity) {
  if (typeof integrity !== 'string' || integrity.trim() === '') {
    throw new Error('manifest is missing dist.integrity; refusing to use the tarball')
  }
  for (const entry of integrity.trim().split(/\s+/)) {
    const match = /^(sha512|sha384|sha256)-([A-Za-z0-9+/=]+)$/.exec(entry)
    if (!match) continue
    const digest = createHash(match[1]).update(buffer).digest('base64')
    if (digest !== match[2]) {
      throw new Error(`tarball integrity mismatch (${match[1]}); refusing to continue`)
    }
    return match[1]
  }
  throw new Error(`unsupported dist.integrity: ${integrity}`)
}

function isUsablePackage(packageDir, version) {
  try {
    const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
    return manifest.version === version
      && existsSync(join(packageDir, 'lib/index.js'))
      && existsSync(join(packageDir, 'lib/types/icons/index.d.ts'))
  } catch {
    return false
  }
}

/**
 * Downloads and verifies the primitives tarball, then extracts it into
 * `<cacheDir>/primitives-<version>/package`. Package scripts are never executed.
 */
export async function downloadPrimitives(source, cacheDir, { fetchImpl = fetch } = {}) {
  const { manifest, primitivesVersion } = source
  const destination = join(cacheDir, `primitives-${primitivesVersion}`)
  const packageDir = join(destination, 'package')

  if (isUsablePackage(packageDir, primitivesVersion)) {
    return packageDir
  }

  rmSync(destination, { recursive: true, force: true })
  mkdirSync(destination, { recursive: true })

  const response = await fetchImpl(manifest.dist.tarball)
  if (!response.ok) {
    throw new Error(`download ${manifest.dist.tarball} -> HTTP ${response.status}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  verifyIntegrity(buffer, manifest.dist.integrity)

  const tarballPath = join(cacheDir, `primitives-${primitivesVersion}.tgz`)
  writeFileSync(tarballPath, buffer)

  try {
    execFileSync('tar', ['-xzf', tarballPath, '-C', destination], { stdio: 'pipe' })
  } catch (error) {
    const stderr = error.stderr?.toString().trim()
    throw new Error(`failed to extract ${tarballPath}${stderr ? `: ${stderr}` : ''}`)
  }
  rmSync(tarballPath, { force: true })

  if (!isUsablePackage(packageDir, primitivesVersion)) {
    throw new Error(`extracted package is missing expected files or has the wrong version: ${packageDir}`)
  }
  return packageDir
}
