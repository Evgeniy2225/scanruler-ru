// SPDX-License-Identifier: AGPL-3.0-only
import { readFileSync, writeFileSync, existsSync, copyFileSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

export function serverEntry(out, node = process.execPath, npx = findNpx()) {
  return {command: node, args: [npx, '-y', 'scanruler-mcp@latest', '--app', 'http://127.0.0.1:7318/', '--out', out]}
}
function findNpx() {
  const candidates = [join(dirname(process.execPath),'node_modules/npm/bin/npx-cli.js')]
  try { for (const file of execFileSync('where.exe',['npx.cmd'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/)) candidates.push(join(dirname(file),'node_modules/npm/bin/npx-cli.js')) } catch {}
  const file=candidates.find(path=>existsSync(path))
  if (!file) throw new Error('Не найден npm/npx. Установите Node.js 22 или новее вместе с npm.')
  return file
}
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
export function mergeConfig(text, entry) {
  const clean=text.replace(/^\uFEFF/,'')
  const data=clean.trim() ? JSON.parse(clean) : {}
  if (!object(data) || (data.mcpServers !== undefined && !object(data.mcpServers))) throw new Error('Некорректная структура настроек Claude; файл не изменён.')
  data.mcpServers ??= {}
  const current=data.mcpServers.scanruler
  if (current !== undefined && (!object(current) || !Array.isArray(current.args) || !current.args.some(arg=>typeof arg==='string' && /^scanruler-mcp(?:@.*)?$/.test(arg)))) {
    throw new Error('Имя scanruler занято другим сервером. Файл не изменён; проверьте настройки Claude.')
  }
  data.mcpServers.scanruler={...current,...entry}
  return JSON.stringify(data,null,2)+'\n'
}
export function saveConfig(config, entry) {
  const existed=existsSync(config), original=existed ? readFileSync(config,'utf8') : ''
  const updated=mergeConfig(original,entry)
  if (original.replace(/^\uFEFF/,'').trim() && JSON.stringify(JSON.parse(original.replace(/^\uFEFF/,'')))===JSON.stringify(JSON.parse(updated))) return {changed:false}
  const stamp=`${Date.now()}-${process.pid}`
  const backup=existed ? `${config}.bak-${stamp}` : null
  const temporary=`${config}.tmp-${stamp}`
  if (backup) copyFileSync(config,backup)
  try {
    writeFileSync(temporary,updated,{flag:'wx'})
    if (existsSync(config)!==existed || (existed && readFileSync(config,'utf8')!==original)) throw new Error('Настройки изменились во время подключения. Повторите запуск.')
    renameSync(temporary,config)
  } finally { if(existsSync(temporary)) unlinkSync(temporary) }
  return {changed:true,backup}
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    if(Number(process.versions.node.split('.')[0])<22)throw new Error('Нужен Node.js 22 или новее.')
    const [mode,first,out]=process.argv.slice(2)
    if(mode==='--entry' && first) console.log(JSON.stringify(serverEntry(first)))
    else if(mode==='--write' && first && out) {
      const result=saveConfig(first,serverEntry(out))
      console.log(result.changed ? `Настройки сохранены: ${first}` : `Подключение уже настроено: ${first}`)
      if(result.backup)console.log(`Резервная копия: ${result.backup}`)
    } else throw new Error('Использование: --entry <экспорт> или --write <config.json> <экспорт>')
  } catch(error) { console.error(`[!] ${error.message}`);process.exitCode=1 }
}
