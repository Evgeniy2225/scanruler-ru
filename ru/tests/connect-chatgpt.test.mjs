// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addConfig, serverBlock, saveConfig } from '../connect-chatgpt.mjs'

test('desktop MCP config preserves other settings and quotes paths with spaces', () => {
  const original = 'model = "example"\r\n[mcp_servers.other]\r\ncommand = "other"\r\n'
  const block = serverBlock('C:\\Program Files\\nodejs\\node.exe','C:\\npm\\npx-cli.js','C:\\Users\\Евгений\\My Documents\\ScanRuler')
  const result = addConfig(original,block)
  assert.ok(result.startsWith(original))
  assert.match(result,/startup_timeout_sec = 60/)
  assert.match(result,/tool_timeout_sec = 300/)
  assert.match(result,/http:\/\/127\.0\.0\.1:7318\//)
  assert.ok(!result.includes('cmd.exe'))
  assert.ok(!result.includes('--serve'))
  const args = JSON.parse(block.split('\n').find(line=>line.startsWith('args = ')).slice(7))
  assert.equal(args.at(-1),'C:\\Users\\Евгений\\My Documents\\ScanRuler')
})

test('existing connections and inline MCP settings are not overwritten', () => {
  for (const text of ['[mcp_servers.scanruler_ru]','[mcp_servers."scanruler_ru"]',"[mcp_servers.'scanruler_ru']",'mcp_servers = {}','"mcp_servers" = {}']) {
    assert.throws(()=>addConfig(text,'new block'))
  }
})

test('writes a backup and refuses a repeat without altering settings', async t => {
  const dir = await mkdtemp(join(tmpdir(),'scanruler-chatgpt-test-'))
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const config=join(dir,'config.toml'), old='model = "example"\n'
  await writeFile(config,old)
  const block=serverBlock('node','npx-cli.js','exports')
  const backup=saveConfig(config,block)
  assert.equal(await readFile(backup,'utf8'),old)
  const once=await readFile(config,'utf8')
  assert.throws(()=>saveConfig(config,block))
  assert.equal(await readFile(config,'utf8'),once)
})
