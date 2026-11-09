/**
 * Generates src/logos.ts from the vendored brand SVGs in assets/logos.
 *
 * Each file is named after the source id it belongs to and holds one 24×24 path.
 * The page draws every mark in a single colour, so only the path data is kept.
 * `--check` regenerates in memory and compares, so a stale or hand-edited
 * artifact fails the test run.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const sourceDir = join(root, 'assets', 'logos')
const target = join(root, 'src', 'logos.ts')

const files = readdirSync(sourceDir).filter((name) => name.endsWith('.svg')).sort()
if (files.length === 0) throw new Error('assets/logos 里没有任何 SVG')

const rows = files.map((file) => {
  const id = file.slice(0, -'.svg'.length)
  const text = readFileSync(join(sourceDir, file), 'utf8')
  const paths = [...text.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((match) => match[1])
  if (paths.length !== 1) {
    throw new Error(`assets/logos/${file} 里应当只有一条 path，实际 ${paths.length} 条`)
  }
  const viewBox = text.match(/viewBox="([^"]+)"/)
  if (viewBox === null || viewBox[1] !== '0 0 24 24') {
    throw new Error(`assets/logos/${file} 的 viewBox 必须是 0 0 24 24`)
  }
  return { id, d: paths[0] }
})

const lines = rows.map((row) => `  ${row.id}: '${row.d}',`).join('\n')
const body = `// 该文件由 scripts/generate-logos.mjs 生成，请勿手改（改 assets/logos 后重新生成）。
/**
 * Official marks of the coding agents, one 24×24 path each, filled with the
 * source's own colour. A source without a published mark falls back to a drawn
 * glyph in the page, so this map only carries brands that exist.
 */
export const AGENT_LOGO: Record<string, string> = {
${lines}
}
`

if (process.argv.includes('--check')) {
  const current = readFileSync(target, 'utf8')
  if (current !== body) throw new Error('src/logos.ts 与 assets/logos 不一致，运行 npm run generate:logos 重新生成')
  console.log(`logos are current (${rows.length} brands)`)
} else {
  writeFileSync(target, body)
  console.log(`generated logos for ${rows.length} brands`)
}
