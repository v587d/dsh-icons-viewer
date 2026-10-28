#!/usr/bin/env node
import { resolveSource } from './lib/source.mjs'

try {
  const source = await resolveSource({
    channel: process.env.DSH_CHANNEL?.trim() || 'next',
    dshVersion: process.env.DSH_VERSION ?? '',
  })
  console.log(JSON.stringify({
    dshVersion: source.dshVersion,
    frontendVersion: source.frontendVersion,
    primitivesVersion: source.primitivesVersion,
    tarball: source.manifest.dist.tarball,
    integrity: source.manifest.dist.integrity,
  }, null, 2))
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
