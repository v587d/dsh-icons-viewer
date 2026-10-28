import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import {
  createRegistry,
  requireExactVersion,
  resolveSource,
  verifyIntegrity,
} from '../scripts/lib/source.mjs'

function fakeRegistry({ frontendRange = '1.0.0', primitivesRange = '1.0.0' } = {}) {
  return {
    async manifest(name, ref) {
      if (name === '@deepseek-ai/dsh' && (ref === 'next' || ref === '1.0.0')) {
        return { version: '1.0.0' }
      }
      if (name === '@deepseek-ai/dsh-web-app' && ref === '1.0.0') {
        return { version: '1.0.0', dependencies: { '@deepseek-ai/dsh-web-frontend': frontendRange } }
      }
      if (name === '@deepseek-ai/dsh-web-frontend' && ref === '1.0.0') {
        return { version: '1.0.0', devDependencies: { '@deepseek-ai/dsh-client-ui-primitives': primitivesRange } }
      }
      if (name === '@deepseek-ai/dsh-client-ui-primitives' && ref === '1.0.0') {
        return {
          version: '1.0.0',
          dist: {
            tarball: 'https://example.test/primitives.tgz',
            integrity: 'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
          },
        }
      }
      throw new Error(`unexpected manifest request: ${name}@${ref}`)
    },
  }
}

test('resolves through dsh -> web-app -> web-frontend -> primitives', async () => {
  const source = await resolveSource({ registry: fakeRegistry() })
  assert.equal(source.dshVersion, '1.0.0')
  assert.equal(source.frontendVersion, '1.0.0')
  assert.equal(source.primitivesVersion, '1.0.0')
  assert.match(source.manifest.dist.tarball, /primitives\.tgz$/)
})

test('honors an explicit DSH version and skips the channel', async () => {
  const channelCalls = []
  const registry = fakeRegistry()
  const wrapped = {
    async manifest(name, ref) {
      if (name === '@deepseek-ai/dsh') channelCalls.push(ref)
      return registry.manifest(name, ref)
    },
  }
  const source = await resolveSource({ channel: 'next', dshVersion: '1.0.0', registry: wrapped })
  assert.equal(source.dshVersion, '1.0.0')
  assert.deepEqual(channelCalls, ['1.0.0'])
})

test('rejects a dependency range instead of guessing', async () => {
  await assert.rejects(
    () => resolveSource({ registry: fakeRegistry({ frontendRange: '^1.0.0' }) }),
    /not an exact version/,
  )
  await assert.rejects(
    () => resolveSource({ registry: fakeRegistry({ primitivesRange: '~1.0.0' }) }),
    /not an exact version/,
  )
})

test('requires exact versions and non-empty ranges', () => {
  assert.equal(requireExactVersion(' 1.2.3-rc.4 ', 'x'), '1.2.3-rc.4')
  assert.throws(() => requireExactVersion('', 'x'), /missing/)
  assert.throws(() => requireExactVersion('latest', 'x'), /not an exact version/)
  assert.throws(() => requireExactVersion('1.2', 'x'), /not an exact version/)
})

test('verifies tarball integrity', () => {
  const buffer = Buffer.from('hello')
  const digest = createHash('sha512').update(buffer).digest('base64')
  assert.equal(verifyIntegrity(buffer, `sha512-${digest}`), 'sha512')

  const wrong = createHash('sha512').update('other').digest('base64')
  assert.throws(() => verifyIntegrity(buffer, `sha512-${wrong}`), /integrity mismatch/)
  assert.throws(() => verifyIntegrity(buffer, ''), /missing dist\.integrity/)
  assert.throws(() => verifyIntegrity(buffer, 'md5-abc'), /unsupported dist\.integrity/)
})

test('createRegistry reports registry failures with context', async () => {
  const registry = createRegistry({
    registry: 'https://registry.test',
    fetchImpl: async () => ({ ok: false, status: 404 }),
  })
  await assert.rejects(() => registry.manifest('@scope/pkg', 'next'), /@scope\/pkg@next -> HTTP 404/)
})
