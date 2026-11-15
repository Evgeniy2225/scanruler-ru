// SPDX-License-Identifier: AGPL-3.0-only
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const repo = fileURLToPath(new URL('../../', import.meta.url))
const bats = ['Запустить ScanRuler.bat', 'Обновить ScanRuler.bat', 'Подключить Claude.bat', 'Подключить ChatGPT.bat']
function run(root, name) {
  return spawnSync('cmd.exe', ['/d', '/c', 'call', name], {
    cwd: root, input: '\n', encoding: 'utf8', windowsHide: true, timeout: 20000,
  })
}
for (const name of bats) test(`BAT reports missing helper: ${name}`, {skip: process.platform !== 'win32' || (name === 'Подключить ChatGPT.bat' && !existsSync(join(repo, name)))}, () => {
  // An isolated folder with no helpers cannot touch real accounts or launch the app.
  const root = mkdtempSync(join(tmpdir(), 'scanruler-bat-'))
  copyFileSync(join(repo, name), join(root, name))
  const result = run(root, name)
  assert.equal(result.status, 1, result.stdout + result.stderr)
})
for (const code of [0, 1, 20]) test(`update BAT handles exit ${code}`, {skip: process.platform !== 'win32'}, () => {
  const root = mkdtempSync(join(tmpdir(), 'scanruler-bat-'))
  const name = 'Обновить ScanRuler.bat'
  copyFileSync(join(repo, name), join(root, name))
  mkdirSync(join(root, 'ru'))
  writeFileSync(join(root, 'ru/check-updates.mjs'), `process.exitCode = ${code}`)
  assert.equal(run(root, name).status, code === 1 ? 1 : 0)
})
