// SPDX-License-Identifier: AGPL-3.0-only
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp,readFile,writeFile,rm,readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mergeConfig,saveConfig,serverEntry } from '../claude-config.mjs'
const entry=serverEntry('C:\\Users\\Евгений\\My Documents\\ScanRuler','C:\\Program Files\\nodejs\\node.exe','C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js')

test('Claude config preserves other servers and migrates the old launcher',()=>{
 const before={preferences:{theme:'dark'},mcpServers:{other:{command:'unchanged'},scanruler:{command:'cmd',args:['/c','npx','-y','scanruler-mcp@latest','--serve','old-dist'],env:{CUSTOM:'preserved'}}}}
 const after=JSON.parse(mergeConfig('\uFEFF'+JSON.stringify(before),entry))
 assert.deepEqual(after.preferences,before.preferences)
 assert.deepEqual(after.mcpServers.other,before.mcpServers.other)
 assert.deepEqual(after.mcpServers.scanruler.env,{CUSTOM:'preserved'})
 assert.equal(after.mcpServers.scanruler.command,entry.command)
 assert.equal(after.mcpServers.scanruler.args.at(-1),'C:\\Users\\Евгений\\My Documents\\ScanRuler')
 assert.ok(after.mcpServers.scanruler.args.includes('http://127.0.0.1:7318/'))
 assert.ok(!after.mcpServers.scanruler.args.includes('--serve'))
})
test('malformed JSON, invalid shapes and unrelated servers are refused',()=>{
 for(const text of ['{broken','null','[]','{"mcpServers":[]}','{"mcpServers":{"scanruler":{"command":"other","args":[]}}}'])assert.throws(()=>mergeConfig(text,entry))
})
test('Claude config backup is exact and repeat setup does not rewrite files',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'scanruler-claude-test-'));t.after(()=>rm(dir,{recursive:true,force:true}))
 const config=join(dir,'claude_desktop_config.json'),original='{ "preferences": {"theme":"dark"} }\r\n'
 await writeFile(config,original)
 const result=saveConfig(config,entry)
 assert.equal(await readFile(result.backup,'utf8'),original)
 const files=await readdir(dir)
 assert.equal(saveConfig(config,entry).changed,false)
 assert.deepEqual(await readdir(dir),files)
 await writeFile(config,'{invalid')
 assert.throws(()=>saveConfig(config,entry))
 assert.equal(await readFile(config,'utf8'),'{invalid')
})
