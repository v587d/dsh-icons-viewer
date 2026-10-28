import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { extractIcons, normalizeSvg, readIconNames } from '../scripts/lib/extract.mjs'

const REGION_START = '//#region lib/types/icons/shared-artwork.js'
const REGION_END = '//#region lib/types/StateDot.js'

function createWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-icons-extract-'))
  return { dir, packageDir: join(dir, 'package'), outDir: join(dir, 'out') }
}

function writePackage(packageDir, { version = '9.9.9', region, names }) {
  mkdirSync(join(packageDir, 'lib/types/icons'), { recursive: true })
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'fixture', version }))
  writeFileSync(
    join(packageDir, 'lib/types/icons/index.d.ts'),
    names.map((name) => `export declare const ${name}: any;`).join('\n') + '\n',
  )
  writeFileSync(join(packageDir, 'lib/index.js'), region)
}

function validRegion() {
  return `${REGION_START}
const IconAlphaRegular = (props) => jsx('svg', { width: props.size, height: props.size, viewBox: '0 0 16 16', fill: 'none', children: jsx('path', { d: 'M1 1L15 15', stroke: 'currentColor' }) })
const IconBetaMedium = (props) => jsx('svg', { width: props.size, height: props.size, viewBox: '0 0 16 16', fill: 'none', children: jsx('path', { d: 'M2 2L14 14', stroke: 'currentColor' }) })
${REGION_END}
`
}

test('extracts icons, normalizes color/size, and writes sorted data', () => {
  const { packageDir, outDir } = createWorkspace()
  try {
    writePackage(packageDir, {
      region: validRegion(),
      names: ['IconBetaMedium', 'IconAlphaRegular'],
    })

    const result = extractIcons({ packageDir, outDir })

    assert.equal(result.version, '9.9.9')
    assert.deepEqual(result.counts, { regular: 1, medium: 1 })
    assert.deepEqual(result.icons.map((icon) => icon.name), ['IconAlphaRegular', 'IconBetaMedium'])

    const svg = readFileSync(join(outDir, 'icons/regular/IconAlphaRegular.svg'), 'utf8')
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="24" height="24"/)
    assert.match(svg, /stroke="#8b949e"/)
    assert.ok(!svg.includes('currentColor'))
    assert.ok(svg.endsWith('</svg>'))

    const data = JSON.parse(readFileSync(join(outDir, 'data/icons.json'), 'utf8'))
    assert.equal(data.version, '9.9.9')
    assert.deepEqual(data.icons, result.icons)
  } finally {
    rmSync(join(outDir, '..'), { recursive: true, force: true })
  }
})

test('removes stale icons from a previous run', () => {
  const { packageDir, outDir } = createWorkspace()
  try {
    writePackage(packageDir, { region: validRegion(), names: ['IconAlphaRegular', 'IconBetaMedium'] })
    extractIcons({ packageDir, outDir })
    assert.ok(existsSync(join(outDir, 'icons/medium/IconBetaMedium.svg')))

    writePackage(packageDir, {
      region: `${REGION_START}
const IconAlphaRegular = (props) => jsx('svg', { width: props.size, height: props.size, viewBox: '0 0 16 16', children: jsx('path', { d: 'M0 0', stroke: 'currentColor' }) })
const IconGammaMedium = (props) => jsx('svg', { width: props.size, height: props.size, viewBox: '0 0 16 16', children: jsx('path', { d: 'M1 1', stroke: 'currentColor' }) })
${REGION_END}
`,
      names: ['IconAlphaRegular', 'IconGammaMedium'],
    })
    extractIcons({ packageDir, outDir })

    assert.ok(existsSync(join(outDir, 'icons/regular/IconAlphaRegular.svg')))
    assert.ok(existsSync(join(outDir, 'icons/medium/IconGammaMedium.svg')))
    assert.equal(existsSync(join(outDir, 'icons/medium/IconBetaMedium.svg')), false)
  } finally {
    rmSync(join(outDir, '..'), { recursive: true, force: true })
  }
})

test('fails loudly when region markers are missing', () => {
  const { packageDir, outDir } = createWorkspace()
  try {
    writePackage(packageDir, {
      region: 'const IconAlphaRegular = () => null\n',
      names: ['IconAlphaRegular'],
    })
    assert.throws(() => extractIcons({ packageDir, outDir }), /region markers not found/)
  } finally {
    rmSync(join(outDir, '..'), { recursive: true, force: true })
  }
})

test('fails before writing anything when an icon does not render', () => {
  const { packageDir, outDir } = createWorkspace()
  try {
    writePackage(packageDir, {
      region: `${REGION_START}
const IconBrokenRegular = () => null
${REGION_END}
`,
      names: ['IconBrokenRegular'],
    })
    assert.throws(() => extractIcons({ packageDir, outDir }), /did not render as a complete svg/)
    assert.equal(existsSync(join(outDir, 'icons')), false)
  } finally {
    rmSync(join(outDir, '..'), { recursive: true, force: true })
  }
})

test('rejects duplicate declarations', () => {
  assert.throws(
    () => readIconNames(
      'export declare const IconAlphaRegular: any;\nexport declare const IconAlphaRegular: any;\n',
    ),
    /duplicate icon declarations/,
  )
  assert.throws(() => readIconNames('export declare const Other: any;\n'), /no icon declarations/)
})

test('normalizeSvg only rewrites the outer svg tag', () => {
  const svg = '<svg width="32" height="32" viewBox="0 0 32 32"><rect width="16" height="16" fill="currentColor"/></svg>'
  assert.equal(
    normalizeSvg(svg),
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 32 32">'
    + '<rect width="16" height="16" fill="#8b949e"/></svg>',
  )
})

test('normalizeSvg adds the svg namespace only when missing', () => {
  const withNamespace = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"></svg>'
  assert.equal(normalizeSvg(withNamespace).match(/xmlns=/g).length, 1)

  const withoutNamespace = '<svg width="16" height="16" viewBox="0 0 16 16"></svg>'
  assert.match(normalizeSvg(withoutNamespace), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
})

test('preserves camelCase svg attributes such as maskUnits', () => {
  const { packageDir, outDir } = createWorkspace()
  try {
    writePackage(packageDir, {
      region: `${REGION_START}
const IconMaskRegular = (props) => jsx('svg', { width: props.size, height: props.size, viewBox: '0 0 16 16', children: jsx('mask', { maskUnits: 'userSpaceOnUse', children: jsx('rect', { width: 16, height: 16, fill: 'white' }) }) })
const IconMaskMedium = (props) => jsx('svg', { width: props.size, height: props.size, viewBox: '0 0 16 16', children: jsx('mask', { maskUnits: 'userSpaceOnUse', children: jsx('rect', { width: 16, height: 16, fill: 'white' }) }) })
${REGION_END}
`,
      names: ['IconMaskRegular', 'IconMaskMedium'],
    })
    extractIcons({ packageDir, outDir })

    const svg = readFileSync(join(outDir, 'icons/regular/IconMaskRegular.svg'), 'utf8')
    assert.match(svg, /<mask maskUnits="userSpaceOnUse">/)
    assert.ok(!svg.includes('mask-units'))
  } finally {
    rmSync(join(outDir, '..'), { recursive: true, force: true })
  }
})
