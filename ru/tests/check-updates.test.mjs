import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkComponent, compareVersions, latestVersion, TIMEOUT_MS } from '../check-updates.mjs'
const component = {name:'ScanRuler', repo:'CNCKitchen/scanruler', packageName:'scanruler', manifest:'unused'}
const manifest = version => async () => JSON.stringify({name:'scanruler',version})
const release = version => async () => ({ok:true,url:`https://github.com/CNCKitchen/ScanRuler/releases/tag/v${version}`})

test('numeric version comparison, prereleases and build metadata', () => {
  assert.equal(compareVersions('0.10.0','0.9.4'),1)
  assert.equal(compareVersions('v0.1.2','0.1.2+build'),0)
  assert.equal(compareVersions('0.1.2','0.2.0'),-1)
  assert.equal(compareVersions('1.0.0','1.0.0-rc.2'),1)
  assert.equal(compareVersions('1.0.0-rc.10','1.0.0-rc.2'),1)
  assert.throws(()=>compareVersions('not-a-version','1.0.0'))
})
test('HEAD request uses a deadline and validates the redirect destination',async()=>{
  assert.equal(TIMEOUT_MS,8000)
  const version=await latestVersion(component.repo,async(url,options)=>{
    assert.equal(url,'https://github.com/CNCKitchen/scanruler/releases/latest')
    assert.equal(options.method,'HEAD')
    assert.equal(options.redirect,'follow')
    assert.ok(options.signal instanceof AbortSignal)
    assert.equal(options.headers.Authorization,undefined)
    return release('0.9.4')()
  })
  assert.equal(version,'0.9.4')
  for(const url of ['https://example.org/v9.0.0','https://github.com/another/repo/releases/tag/v9.0.0','https://github.com/CNCKitchen/scanruler/releases','https://github.com/CNCKitchen/scanruler/releases/tag/unknown']){
    await assert.rejects(latestVersion(component.repo,async()=>({ok:true,url})))
  }
})
test('reports available, current and locally newer versions',async()=>{
  for(const [installed,pattern] of [['0.9.3',/доступно обновление 0.9.3 → 0.9.4/],['0.9.4',/обновлений нет/],['0.10.0',/установленная версия новее/]]){
    const result=await checkComponent(component,{readManifest:manifest(installed),fetchImpl:release('0.9.4')})
    assert.match(result,pattern)
  }
})
test('offline, timeout and HTTP errors do not claim there are no updates',async()=>{
  for(const fetchImpl of [async()=>{throw new TypeError('fetch failed')},async()=>{throw new DOMException('timeout','TimeoutError')},async()=>({ok:false,status:429})]){
    const result=await checkComponent(component,{readManifest:manifest('0.9.4'),fetchImpl})
    assert.match(result,/проверить обновления не удалось/)
    assert.doesNotMatch(result,/обновлений нет/)
  }
})
test('missing or wrong manifest does not prevent checking another component',async()=>{
  const results=await Promise.all([
    checkComponent(component,{readManifest:async()=>{throw new Error('missing')},fetchImpl:release('0.9.4')}),
    checkComponent(component,{readManifest:manifest('0.9.3'),fetchImpl:release('0.9.4')}),
    checkComponent(component,{readManifest:async()=>'{"name":"scanruler-ru","version":"0.9.3"}',fetchImpl:release('0.9.4')}),
  ])
  assert.match(results[0],/версия не определена/)
  assert.match(results[1],/доступно обновление/)
  assert.match(results[2],/версия не определена/)
})
