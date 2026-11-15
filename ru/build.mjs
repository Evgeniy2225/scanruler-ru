// Собирает ru/scanruler-ru.js (словарь + движок) и ru/scanruler-ru.user.js
// (для Tampermonkey/Violentmonkey на scanruler.com) из ru/i18n/*.json.
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dict = {}
for (const f of readdirSync(join(here, 'i18n')).filter((f) => f.endsWith('.json')).sort()) {
  const part = JSON.parse(readFileSync(join(here, 'i18n', f), 'utf8'))
  for (const [k, v] of Object.entries(part)) if (typeof v === 'string' && v.trim()) dict[k] = v
}
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8'))
const runtime = readFileSync(join(here, 'src', 'runtime.js'), 'utf8')
const fonts = readFileSync(join(here, 'src', 'fonts.css'), 'utf8')
const body =
  `window.__SCANRULER_RU_DICT=${JSON.stringify(dict)};\n` +
  `(function(){try{var s=document.createElement('style');s.textContent=${JSON.stringify(fonts)};(document.head||document.documentElement).appendChild(s)}catch(e){}})();\n` +
  runtime
writeFileSync(join(here, 'scanruler-ru.js'), `/* ScanRuler RU ${pkg.version} */\n` + body)
const header = `// ==UserScript==
// @name         ScanRuler RU — русский интерфейс
// @namespace    scanruler-ru
// @version      ${pkg.version}
// @description  Русификатор интерфейса ScanRuler by CNC Kitchen. Alt+Shift+L — RU/EN.
// @match        https://scanruler.com/*
// @match        http://127.0.0.1/*
// @match        http://localhost/*
// @run-at       document-start
// @grant        none
// ==/UserScript==
`
writeFileSync(join(here, 'scanruler-ru.user.js'), header + body)
console.log(`ScanRuler RU: ${Object.keys(dict).length} строк в словаре.`)
