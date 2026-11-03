// Добавляет сервер scanruler в claude_desktop_config.json, сохраняя всё остальное.
// node ru/claude-config.mjs <config.json> <dist> <out>
// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
const [cfg, dist, out] = process.argv.slice(2)
let data = {}
if (existsSync(cfg)) {
  const text = readFileSync(cfg, 'utf8').replace(/^﻿/, '')
  if (text.trim()) data = JSON.parse(text)
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  copyFileSync(cfg, `${cfg}.bak-${stamp}`)
}
data.mcpServers ??= {}
data.mcpServers.scanruler = { command: 'cmd', args: ['/c', 'npx', '-y', 'scanruler-mcp@latest', '--serve', dist, '--out', out] }
writeFileSync(cfg, JSON.stringify(data, null, 2) + '\n')
console.log(`OK: ${cfg}`)
