// SPDX-License-Identifier: AGPL-3.0-only
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installPrepared, installScanRuler } from '../install-scanruler.mjs'
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'scanruler-install-test-'))
  const source = join(root, 'stage'); await mkdir(source)
  await writeFile(join(source, 'package.json'), '{"name":"scanruler"}')
  return {root, source}
}
test('first installation keeps the ru folder and places the app beside it', async () => {
  const {root, source} = await fixture()
  await mkdir(join(root, 'ru')); await writeFile(join(root,'ru/keep.txt'), 'translation')
  await installPrepared(source, root)
  assert.equal(await readFile(join(root,'ru/keep.txt'),'utf8'), 'translation')
  assert.equal(await readFile(join(root,'package.json'),'utf8'), '{"name":"scanruler"}')
})
test('installation refuses conflicting files without replacing them', async () => {
  const {root, source} = await fixture()
  await writeFile(join(root, 'package.json'), 'existing')
  await assert.rejects(installPrepared(source, root), /Файлы не заменены/)
  assert.equal(await readFile(join(root,'package.json'),'utf8'), 'existing')
  await access(join(source,'package.json'))
})
test('existing installation is refused before network or build commands', async () => {
  const {root} = await fixture()
  await mkdir(join(root, 'dist'))
  await assert.rejects(installScanRuler(root), /Обновить ScanRuler.bat/)
})
