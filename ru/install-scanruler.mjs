// SPDX-License-Identifier: AGPL-3.0-only
import { access, lstat, readdir, mkdtemp, rename, rmdir, readFile, open, unlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { latestRelease, isYes } from './check-updates.mjs'
import { run } from './install-update.mjs'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const exists = path => lstat(path).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error })

// Commit a fully built clone without replacing any existing file. Roll back
// completed moves if a later move fails; the original ru folder stays in place.
export async function installPrepared(source, root) {
  source = resolve(source); root = resolve(root)
  const names = await readdir(source)
  for (const name of names) if (await exists(join(root, name))) throw new Error(`В папке уже есть «${name}». Файлы не заменены.`)
  const moved = []
  try {
    for (const name of names) {
      if (await exists(join(root, name))) throw new Error(`Во время установки появился файл «${name}». Установка отменена.`)
      await rename(join(source, name), join(root, name)); moved.push(name)
    }
  } catch (error) {
    for (const name of moved.reverse()) await rename(join(root, name), join(source, name))
    throw error
  }
}

export async function installScanRuler(root = ROOT) {
  root = resolve(root)
  for (const name of ['package.json', '.git', 'node_modules', 'dist']) {
    if (await exists(join(root, name))) throw new Error(`Найдена существующая установка или папка «${name}». Для установленного ScanRuler используйте «Обновить ScanRuler.bat».`)
  }
  const npm = join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  await access(npm).catch(() => { throw new Error('Не найден npm. Установите Node.js 22 или новее вместе с npm.') })
  await run('git', ['--version'], root)
  const ru = JSON.parse(await readFile(join(root, 'ru/package.json'), 'utf8'))
  if (ru.name !== 'scanruler-ru') throw new Error('Рядом с BAT-файлом должна находиться папка ru из архива русификатора.')
  const release = await latestRelease('CNCKitchen/scanruler')
  const lockPath = join(root, '.scanruler-install.lock')
  const lock = await open(lockPath, 'wx').catch(() => { throw new Error('Другая установка уже запущена или остался файл .scanruler-install.lock. Проверьте другие окна установки.') })
  let stage
  try {
    stage = await mkdtemp(join(root, '.scanruler-install-'))
    const app = join(stage, 'app')
    console.log(`Устанавливаю ScanRuler ${release.version} в ${root}`)
    await run('git', ['clone', '--depth', '1', '--branch', release.tag, 'https://github.com/CNCKitchen/scanruler.git', app], root)
    await run('git', ['switch', '-c', 'scanruler-local'], app)
    const pkg = JSON.parse(await readFile(join(app, 'package.json'), 'utf8'))
    if (pkg.name !== 'scanruler' || pkg.version !== release.version) throw new Error('Версия скачанного ScanRuler не совпадает с релизом.')
    // Refuse collisions before spending time installing dependencies.
    for (const name of await readdir(app)) if (await exists(join(root, name))) throw new Error(`В папке уже есть «${name}». Файлы не заменены.`)
    await run(process.execPath, [npm, 'ci', '--no-audit', '--no-fund'], app)
    await run(process.execPath, [npm, 'run', 'build'], app)
    await run(process.execPath, [join(root, 'ru/apply.mjs'), join(app, 'dist')], root)
    await installPrepared(app, root)
    // Both directories are now empty: never recursively remove an install path.
    await rmdir(app); await rmdir(stage); stage = null
    console.log('ScanRuler установлен, русификатор подключён. Запустите «Запустить ScanRuler.bat» снова.')
  } catch (error) {
    if (stage) console.error(`Рабочие файлы установки сохранены для диагностики: ${stage}`)
    throw error
  } finally {
    await lock.close(); await unlink(lockPath)
  }
}

export async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Нужен Node.js 22 или новее.')
  if (await exists(join(ROOT, 'package.json'))) throw new Error('Программа уже установлена в этой папке. Используйте «Запустить ScanRuler.bat» или «Обновить ScanRuler.bat».')
  if (process.argv.includes('--prompt')) {
    if (!process.stdin.isTTY) { console.log('Нет интерактивной консоли. Установка пропущена.'); return }
    console.log(`ScanRuler ещё не установлен. Папка установки: ${ROOT}`)
    console.log('Будет загружен последний стабильный релиз. Нужны интернет, Git и свободное место для сборки.')
    const {createInterface} = await import('node:readline/promises')
    const rl = createInterface({input:process.stdin, output:process.stdout})
    let answer
    try { answer = await rl.question('Установить ScanRuler в эту папку? [д/N]: ') } finally { rl.close() }
    if (!isYes(answer)) { console.log('Установка отменена.'); return }
  }
  await installScanRuler()
  process.exitCode = 20
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(`[!] ${error.message}`); process.exitCode = 1 })
