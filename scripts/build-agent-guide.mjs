// Writes public/llms.txt from src/lib/agentGuide.js.
//
// The guide has to exist as a real file, not just a React route. The argument
// is the one already made for privacy.html in netlify.toml: a crawler that
// does not reliably run JavaScript gets handed the empty SPA shell by the /*
// catch-all, and an agent trying to learn its way around this CRM is exactly
// that kind of reader. A file in public/ is served before the catch-all
// applies, the same way favicon.svg and manifest.webmanifest already are.
//
// Generated rather than hand-written so it cannot drift from the page. Run by
// `npm run build` through the prebuild hook, which means Netlify runs it too,
// and the committed copy is checked for staleness by
// scripts/check-agent-guide.mjs.
//
// llms.txt is the name because that is the convention agents look for.

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { formatAgentGuide } from '../src/lib/agentGuide.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'public', 'llms.txt')

const header = [
  '# This file is generated from src/lib/agentGuide.js. Do not edit it by hand;',
  '# edit that module and run `npm run guide`. The same content is rendered at',
  '# /guide inside the app.',
  '',
  '',
].join('\n')

export function guideText() {
  return header + formatAgentGuide()
}

// Importable by the check script without writing anything.
if (process.argv[1] && process.argv[1].endsWith('build-agent-guide.mjs')) {
  const text = guideText()
  writeFileSync(target, text, 'utf8')
  console.log(`wrote public/llms.txt (${text.length} bytes)`)
}
