import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { offerUpdates } from '../check-updates.mjs'
import { replaceWithBackup } from '../install-update.mjs'
import { isOurPage } from '../launch.mjs'
const update = {component:{name:'ScanRuler'},version:'1.0.0'}

test('Enter and no skip installation; explicit Russian or English yes confirms',async()=>{
  for (const answer of ['', 'нет', 'n','something']) {
    assert.equal(await offerUpdates([update],{ask:async()=>answer,install:async()=>assert.fail('must not install')}),false)
  }
  for (const answer of ['д','Да','y','YES']) {
    let installed=0
    assert.equal(await offerUpdates([update],{ask:async()=>answer,install:async()=>installed++,log:()=>{}}),true)
    assert.equal(installed,1)
  }
})

test('only available updates prompt; a failure does not hide the other update',async()=>{
  let prompts=0, installs=0; const messages=[]
  assert.equal(await offerUpdates([{message:'current'},update,update],{
    ask:async()=>{prompts++;return 'y'},
    install:async()=>{if(++installs===1) throw new Error('offline')},
    log:text=>messages.push(text),
  }),true)
  assert.equal(prompts,2);assert.equal(installs,2);assert.match(messages[0],/offline/)
})

async function fixture(t) {
  const dir=await mkdtemp(join(tmpdir(),'scanruler-test-'))
  t.after(()=>rm(dir,{recursive:true,force:true}))
  const root=join(dir,'root'),stage=join(dir,'stage')
  for(const folder of [root,stage]) await mkdir(join(folder,'ru'),{recursive:true})
  await writeFile(join(root,'ru/version'),'old')
  await writeFile(join(stage,'ru/version'),'new')
  await writeFile(join(root,'project.scanruler'),'user project')
  return {root,stage}
}

test('replacement keeps a backup and preserves user projects',async t=>{
  const {root,stage}=await fixture(t)
  const backup=await replaceWithBackup(stage,root,['ru'])
  assert.equal(await readFile(join(root,'ru/version'),'utf8'),'new')
  assert.equal(await readFile(join(backup,'ru/version'),'utf8'),'old')
  assert.equal(await readFile(join(root,'project.scanruler'),'utf8'),'user project')
})

test('partial replacement failure rolls back all completed swaps',async t=>{
  const {root,stage}=await fixture(t)
  await writeFile(join(root,'launcher.bat'),'old launcher')
  await assert.rejects(replaceWithBackup(stage,root,['ru','launcher.bat']))
  assert.equal(await readFile(join(root,'ru/version'),'utf8'),'old')
  assert.equal(await readFile(join(root,'launcher.bat'),'utf8'),'old launcher')
  assert.equal(await readFile(join(stage,'ru/version'),'utf8'),'new')
})

test('post-install failure restores old files and removes newly introduced ones',async t=>{
  const {root,stage}=await fixture(t)
  await writeFile(join(stage,'new-file'),'new')
  await assert.rejects(replaceWithBackup(stage,root,['ru','new-file'],async()=>{throw new Error('verification failed')}))
  assert.equal(await readFile(join(root,'ru/version'),'utf8'),'old')
  await assert.rejects(stat(join(root,'new-file')))
})

test('MCP waiting page and foreign pages are never reused as the app',async t=>{
  const {root}=await fixture(t)
  await mkdir(join(root,'dist'))
  await writeFile(join(root,'dist/index.html'),'<html>ScanRuler</html>')
  await writeFile(join(root,'dist/scanruler-ru.js'),'translation')
  const fake=text=>async()=>({ok:true,text:async()=>text})
  assert.equal(await isOurPage('http://localhost/',root,fake('scanruler-mcp: waiting for the ScanRuler page')),false)
  assert.equal(await isOurPage('http://localhost/',root,async url=>({ok:true,text:async()=>url.endsWith('.js')?'translation':'<html>ScanRuler</html>'})),true)
  assert.equal(await isOurPage('http://localhost/',root,async()=>{throw new Error('offline')}),false)
})
