// SPDX-License-Identifier: AGPL-3.0-only
// Configure local ChatGPT/Codex MCP without rewriting unrelated TOML settings.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
const BEGIN = '# BEGIN ScanRuler RU desktop MCP'
const END = '# END ScanRuler RU desktop MCP'
const ID = 'scanruler_ru'

export function serverBlock(node, npx, out) {
  const args = [npx, '-y', 'scanruler-mcp@latest', '--app', 'http://127.0.0.1:7318/', '--out', out]
  return [BEGIN, `[mcp_servers.${ID}]`, `command = ${JSON.stringify(node)}`,
    `args = ${JSON.stringify(args)}`, 'startup_timeout_sec = 60', 'tool_timeout_sec = 300', END].join('\n')
}

export function addConfig(original, block) {
  // Never replace an existing connection: it may have user-specific permissions.
  // A conservative check also catches quoted keys and inline TOML tables.
  if (original.includes(ID) || original.includes(BEGIN)) {
    throw new Error('Подключение scanruler_ru уже есть. Настройки оставлены без изменений. При необходимости измените его в разделе MCP servers приложения.')
  }
  if (/^\s*(?:mcp_servers|"mcp_servers"|'mcp_servers')\s*=/m.test(original)) {
    throw new Error('В настройках используется встроенная таблица mcp_servers. Добавьте сервер через Settings → MCP servers; файл не изменён.')
  }
  const newline = original.includes('\r\n') ? '\r\n' : '\n'
  return original + (original && !original.endsWith('\n') ? newline : '') + newline + block.replace(/\n/g, newline) + newline
}

export function saveConfig(config, block) {
  const existed = existsSync(config)
  const original = existed ? readFileSync(config, 'utf8') : ''
  const updated = addConfig(original, block)
  mkdirSync(dirname(config), {recursive: true})
  let backup = null
  if (existed) {
    backup = `${config}.scanruler-backup-${Date.now()}`
    copyFileSync(config, backup)
  }
  // Avoid overwriting a settings change made while this script was preparing its block.
  if (existsSync(config) !== existed || (existed && readFileSync(config,'utf8') !== original)) {
    throw new Error('Настройки изменились во время подключения. Повторите запуск.')
  }
  try { writeFileSync(config, updated, {flag: existed ? 'w' : 'wx'}) }
  catch (error) { if (backup) copyFileSync(backup, config); throw error }
  return backup
}

function findNpx() {
  const candidates = [join(dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js')]
  try {
    for (const file of execFileSync('where.exe',['npx.cmd'],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/)) {
      candidates.push(join(dirname(file), 'node_modules/npm/bin/npx-cli.js'))
    }
  } catch {}
  const file = candidates.find(path => existsSync(path))
  if (!file) throw new Error('Не найден npx-cli.js. Установите Node.js 22 или новее вместе с npm.')
  return file
}

export function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Нужен Node.js 22 или новее.')
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  if (!existsSync(join(root,'dist/index.html'))) throw new Error('Сначала запустите «Запустить ScanRuler.bat» в папке установленного ScanRuler, чтобы создать сборку dist.')
  const app = JSON.parse(readFileSync(join(root,'package.json'),'utf8'))
  if (app.name !== 'scanruler') throw new Error('Скопируйте BAT и папку ru в папку самого ScanRuler, рядом с его package.json.')
  const config = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'config.toml')
  const documents = execFileSync('powershell.exe',['-NoProfile','-Command',"[Console]::OutputEncoding = [Text.UTF8Encoding]::new(); [Environment]::GetFolderPath('MyDocuments')"],{encoding:'utf8',windowsHide:true}).trim()
  if (!documents) throw new Error('Не удалось определить папку «Документы».')
  const out = join(documents,'ScanRuler')
  const backup = saveConfig(config, serverBlock(process.execPath, findNpx(), out))
  console.log(`Подключение scanruler_ru добавлено: ${config}`)
  if (backup) console.log(`Резервная копия: ${backup}`)
  console.log('\nДля настольного ChatGPT с разделом MCP servers и для Codex. Веб-версия ChatGPT эти настройки не читает.')
  console.log('1. Перезапустите настольное приложение или MCP-серверы в его настройках.')
  console.log('2. Запустите «Запустить ScanRuler.bat». Обычно адрес: http://127.0.0.1:7318/.')
  console.log('3. Попросите агента подключиться к открытой странице ScanRuler и подтвердите подключение в ScanRuler.')
  console.log('Если порт 7318 занят и интерфейс открылся на другом порту, используйте фактический адрес из консоли и включите подключение локального агента в настройках ScanRuler.')
  console.log(`Экспорт: ${out}`)
  console.log('При первом подключении npx скачает scanruler-mcp; потребуется интернет. API-ключ не нужен.')
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) { console.error(`[!] ${error.message}`); process.exitCode = 1 }
}
