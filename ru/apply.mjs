// Встраивает русификатор в собранный ScanRuler: копирует scanruler-ru.js
// в dist/ и подключает его в dist/index.html. Повторный запуск безопасен.
// Использование: node ru/apply.mjs [папка dist]
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = resolve(process.argv[2] ?? join(here, '..', 'dist'))
const html = join(dist, 'index.html')
if (!existsSync(html)) { console.error(`Нет ${html} — сначала соберите ScanRuler (npm run build).`); process.exit(1) }
copyFileSync(join(here, 'scanruler-ru.js'), join(dist, 'scanruler-ru.js'))
let page = readFileSync(html, 'utf8')
const tag = '<script src="/scanruler-ru.js"></script>'
if (!page.includes(tag)) {
  // Before the app's own module, so the first paint is already Russian.
  page = page.replace(/<script type="module"/, `${tag}\n    <script type="module"`)
  if (!page.includes(tag)) page = page.replace('</head>', `  ${tag}\n  </head>`)
  page = page.replace('<html lang="en">', '<html lang="ru">')
  writeFileSync(html, page)
}
console.log(`Русификатор подключён: ${dist}`)
