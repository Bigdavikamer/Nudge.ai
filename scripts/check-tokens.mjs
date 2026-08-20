/**
 * Enforces the rule from §3: colours are defined once, in styles/tokens.css,
 * and referenced as custom properties everywhere else. A hex literal anywhere
 * else is a colour that escaped the aging scale.
 *
 *   node scripts/check-tokens.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = process.cwd()
const ALLOWED = new Set(['styles/tokens.css'])
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.pglite', 'drizzle', 'coverage'])
const EXTENSIONS = ['.css', '.ts', '.tsx', '.jsx', '.js', '.mjs']
const HEX = /#[0-9a-fA-F]{3,8}\b/g

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (EXTENSIONS.some((ext) => entry.endsWith(ext))) out.push(full)
  }
  return out
}

const violations = []
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file).split(sep).join('/')
  if (ALLOWED.has(rel)) continue
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, i) => {
    for (const match of line.matchAll(HEX)) {
      violations.push({ file: rel, line: i + 1, text: match[0], source: line.trim() })
    }
  })
}

if (violations.length > 0) {
  console.error(`\n${violations.length} hex colour literal(s) outside styles/tokens.css:\n`)
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.text}`)
    console.error(`    ${v.source.slice(0, 100)}`)
  }
  console.error('\nDefine the colour as a token in styles/tokens.css and use var(--name).\n')
  process.exit(1)
}

console.log('tokens: no hex literals outside styles/tokens.css')
