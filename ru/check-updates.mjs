// SPDX-License-Identifier: AGPL-3.0-only
// Release check; installation is optional and requires console confirmation.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TIMEOUT_MS = 8000
export const COMPONENTS = [
  { name: 'ScanRuler', repo: 'CNCKitchen/scanruler', manifest: new URL('../package.json', import.meta.url), packageName: 'scanruler' },
  { name: 'Русификатор', repo: 'Evgeniy2225/scanruler-ru', manifest: new URL('./package.json', import.meta.url), packageName: 'scanruler-ru' },
]

export function parseVersion(value) {
  if (typeof value !== 'string') throw new Error('неизвестный формат версии')
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value.trim())
  if (!match) throw new Error('неизвестный формат версии')
  return { numbers: match.slice(1, 4).map(BigInt), pre: match[4]?.split('.') ?? [] }
}

export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b)
  const cmp = (a, b) => a === b ? 0 : a > b ? 1 : -1
  for (let i = 0; i < 3; i++) if (x.numbers[i] !== y.numbers[i]) return cmp(x.numbers[i], y.numbers[i])
  if (!x.pre.length || !y.pre.length) return cmp(Number(!x.pre.length), Number(!y.pre.length))
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    if (x.pre[i] === undefined || y.pre[i] === undefined) return cmp(x.pre.length, y.pre.length)
    const a = x.pre[i], b = y.pre[i]
    if (a === b) continue
    const an = /^\d+$/.test(a), bn = /^\d+$/.test(b)
    return an && bn ? cmp(BigInt(a), BigInt(b)) : an !== bn ? (an ? -1 : 1) : cmp(a, b)
  }
  return 0
}

export async function latestRelease(repo, fetchImpl = fetch) {
  // HEAD follows GitHub's stable "latest" redirect without downloading the page.
  const response = await fetchImpl(`https://github.com/${repo}/releases/latest`, {
    method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'ScanRuler-RU-update-check' },
  })
  if (!response.ok) throw new Error(`GitHub ответил HTTP ${response.status}`)
  const url = new URL(response.url)
  const prefix = `/${repo}/releases/tag/`
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || !url.pathname.toLowerCase().startsWith(prefix.toLowerCase())) {
    throw new Error('последний релиз не найден')
  }
  const version = decodeURIComponent(url.pathname.slice(prefix.length))
  parseVersion(version)
  return { version: version.replace(/^v/, ''), tag: version }
}

export async function latestVersion(repo, fetchImpl = fetch) {
  return (await latestRelease(repo, fetchImpl)).version
}

export async function inspectComponent(component, { fetchImpl = fetch, readManifest = readFile } = {}) {
  const link = `https://github.com/${component.repo}/releases/latest`
  let installed
  try {
    const pkg = JSON.parse(await readManifest(component.manifest, 'utf8'))
    if (pkg.name !== component.packageName) throw new Error('неверная папка установки')
    installed = pkg.version
    parseVersion(installed)
  } catch {
    return { message: `[?] ${component.name}: установленная версия не определена. Проверьте папку установки.\n    ${link}` }
  }
  try {
    const release = await latestRelease(component.repo, fetchImpl)
    const latest = release.version
    const comparison = compareVersions(latest, installed)
    if (comparison > 0) return { component, installed, ...release, message: `[!] ${component.name}: доступно обновление ${installed} → ${latest}.\n    Скачать: ${link}` }
    if (comparison < 0) return { message: `[OK] ${component.name}: установлено ${installed}; последний релиз ${latest} — установленная версия новее.` }
    return { message: `[OK] ${component.name}: ${installed} — обновлений нет.` }
  } catch (error) {
    const reason = ['TimeoutError', 'AbortError'].includes(error?.name) ? 'истекло время ожидания' : 'GitHub недоступен или не удалось прочитать версию'
    return { message: `[?] ${component.name}: установлено ${installed}; проверить обновления не удалось (${reason}).\n    Проверить вручную: ${link}` }
  }
}

export async function checkComponent(component, options) {
  return (await inspectComponent(component, options)).message
}

export function isYes(answer) { return /^(y|yes|д|да)$/i.test(answer.trim()) }

export async function offerUpdates(results, { ask, install, log = console.log }) {
  let changed = false
  // Update the application first; the current updater stays loaded in memory.
  for (const update of results.filter(result => result.component)) {
    if (!isYes(await ask(`Установить ${update.component.name} ${update.version}? [д/N]: `))) continue
    try {
      await install(update)
      changed = true
      log(`[OK] ${update.component.name} обновлён до ${update.version}.`)
    } catch (error) {
      log(`[!] Обновление не установлено: ${error.message}`)
    }
  }
  return changed
}

export async function main() {
  console.log('\nПроверка обновлений ScanRuler и русификатора (до 8 секунд)…')
  const results = await Promise.all(COMPONENTS.map(component => inspectComponent(component)))
  results.forEach(result => console.log(result.message))
  if (process.argv.includes('--install') && results.some(result => result.component)) {
    if (!process.stdin.isTTY) console.log('Нет интерактивной консоли: установка пропущена.')
    else {
      console.log('Перед обновлением сохраните проект и закройте другие окна запуска ScanRuler. Enter — пропустить.')
      const { createInterface } = await import('node:readline/promises')
      const { installUpdate } = await import('./install-update.mjs')
      const rl = createInterface({ input: process.stdin, output: process.stdout })
      try {
        const changed = await offerUpdates(results, { ask: text => rl.question(text), install: installUpdate })
        // The BAT file can itself have been replaced. Restart it before continuing.
        if (changed) process.exitCode = 20
      } finally { rl.close() }
    }
  }
  console.log('Проверка завершена.\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.log('[?] Проверка обновлений не выполнена. Продолжаю запуск.')
  })
}
