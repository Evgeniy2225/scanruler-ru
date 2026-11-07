// SPDX-License-Identifier: AGPL-3.0-only
import { mkdtemp, readFile, writeFile, mkdir, rename, cp, stat, realpath, rm, open } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { compareVersions, parseVersion } from './check-updates.mjs'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BATS = ['Запустить ScanRuler.bat', 'Обновить ScanRuler.bat', 'Подключить Claude.bat']
const exists = path => stat(path).then(() => true, () => false)

export function run(command, args, cwd, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd, windowsHide: true, stdio: capture ? ['ignore','pipe','pipe'] : ['ignore','inherit','inherit']})
    let output = '', errors = ''
    if (capture) { child.stdout.on('data', data => {output += data}); child.stderr.on('data', data => {errors = (errors + data).slice(-1500)}) }
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve(output.trim()) : reject(new Error(`${command}: ${errors.trim() || `код ${code}. См. сообщение выше.`}`)))
  })
}

// Keep the old files until the full operation succeeds; undo only our own swaps.
export async function replaceWithBackup(source, root, names, after = async () => {}) {
  const backups = join(root, '.scanruler-backups')
  await mkdir(backups, {recursive: true})
  const backup = await mkdtemp(join(backups, 'update-'))
  const moves = []
  try {
    for (const name of names) {
      const target = join(root, name), previous = join(backup, name)
      const move = {name, old: false, fresh: false}; moves.push(move)
      if (await exists(target)) {await mkdir(dirname(previous), {recursive: true}); await rename(target, previous); move.old = true}
      await mkdir(dirname(target), {recursive: true})
      await rename(join(source, name), target); move.fresh = true
    }
    await after()
    console.log(`Резервная копия: ${backup}`)
    return backup
  } catch (error) {
    for (const move of moves.reverse()) {
      if (move.fresh) {await mkdir(dirname(join(source, move.name)), {recursive: true}); await rename(join(root, move.name), join(source, move.name))}
      if (move.old) await rename(join(backup, move.name), join(root, move.name))
    }
    throw error
  }
}

async function download(url, destination) {
  const response = await fetch(url, {signal: AbortSignal.timeout(60000)})
  if (!response.ok) throw new Error(`Не удалось скачать архив: HTTP ${response.status}`)
  const chunks = []; let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > 30 * 1024 * 1024) throw new Error('Архив превышает 30 МБ')
    chunks.push(chunk)
  }
  await writeFile(destination, Buffer.concat(chunks))
}

async function installRu(update, root, temp) {
  const archive = join(temp, 'ru.zip'), extracted = join(temp, 'files')
  await download(`https://github.com/Evgeniy2225/scanruler-ru/releases/download/${encodeURIComponent(update.tag)}/scanruler-ru-${update.version}.zip`, archive)
  await mkdir(extracted)
  // Validate every ZIP entry before extraction: no traversal, symlinks, or files outside the package.
  const script = join(temp, 'extract.ps1')
  await writeFile(script, `\uFEFFparam([string]$Archive,[string]$Destination)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($Archive)
try {
  $total=0
  foreach ($e in $zip.Entries) {
    $n=$e.FullName.Replace('\\','/')
    $total += $e.Length
    if ($total -gt 100MB -or $n -match '(^/|:|(^|/)\\.\\.(/|$))' -or (($e.ExternalAttributes -shr 16) -band 61440) -eq 40960) { throw 'Unsafe archive entry' }
    if ($n -ne 'ru/' -and -not $n.StartsWith('ru/') -and $n -notin @('${BATS.join("','")}')) { throw 'Unexpected archive file' }
  }
} finally { $zip.Dispose() }
[IO.Compression.ZipFile]::ExtractToDirectory($Archive,$Destination)
`, 'utf8')
  await run('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',script,archive,extracted], root)
  const pkg = JSON.parse(await readFile(join(extracted,'ru/package.json'), 'utf8'))
  if (pkg.name !== 'scanruler-ru' || pkg.version !== update.version) throw new Error('Версия в архиве не соответствует релизу')
  for (const name of ['ru/apply.mjs','ru/scanruler-ru.js',...BATS]) if (!await exists(join(extracted,name))) throw new Error(`В архиве нет ${name}`)
  // Prepare the translated page before replacing anything in the installation.
  const names = ['ru', ...BATS]
  if (await exists(join(root,'dist/index.html'))) {
    await mkdir(join(extracted,'dist'))
    await cp(join(root,'dist/index.html'),join(extracted,'dist/index.html'))
    await run(process.execPath,[join(extracted,'ru/apply.mjs'),join(extracted,'dist')],root)
    names.push('dist/index.html','dist/scanruler-ru.js')
  }
  await replaceWithBackup(extracted,root,names)
}

async function installApp(update, root, temp) {
  const git = (...args) => run('git',args,root,true)
  if (resolve(await git('rev-parse','--show-toplevel')).toLowerCase() !== root.toLowerCase()) throw new Error('ScanRuler должен быть установлен через git clone')
  const remote = await git('remote','get-url','origin')
  if (!/^(https:\/\/github\.com\/CNCKitchen\/scanruler(?:\.git)?|git@github\.com:CNCKitchen\/scanruler(?:\.git)?)$/i.test(remote)) throw new Error('origin не указывает на официальный репозиторий ScanRuler')
  if (await git('status','--porcelain','--untracked-files=no')) throw new Error('Исходники ScanRuler изменены вручную. Сохраните изменения перед обновлением.')
  await git('symbolic-ref','--short','HEAD')
  const old = await git('rev-parse','HEAD')
  await run('git',['fetch','origin',`refs/tags/${update.tag}`],root)
  const target = await git('rev-parse','FETCH_HEAD')
  try { await git('merge-base','--is-ancestor',old,target) } catch { throw new Error('Ветка ScanRuler расходится с релизом. Автоматическое обновление отменено.') }
  const stage = join(temp,'app')
  let attached = false, merged = false
  try {
    await run('git',['worktree','add','--detach',stage,target],root); attached = true
    const pkg = JSON.parse(await readFile(join(stage,'package.json'),'utf8'))
    if (pkg.name !== 'scanruler' || compareVersions(pkg.version,update.version) !== 0) throw new Error('Версия исходников не соответствует релизу')
    // Preserve local build configuration without displaying its contents.
    for (const file of ['.env','.env.local','.env.production','.env.production.local']) if (await exists(join(root,file))) await cp(join(root,file),join(stage,file))
    const npm = process.platform === 'win32' ? (args => run('cmd.exe',['/d','/s','/c',`npm ${args.join(' ')}`],stage)) : (args => run('npm',args,stage))
    await npm(['ci','--no-audit','--no-fund'])
    await npm(['run','build'])
    await run(process.execPath,[join(root,'ru/apply.mjs'),join(stage,'dist')],root)
    if (await git('rev-parse','HEAD') !== old || await git('status','--porcelain','--untracked-files=no')) throw new Error('Исходники изменились во время сборки; установка отменена')
    await run('git',['merge','--ff-only',target],root); merged = true
    await replaceWithBackup(stage,root,['dist','node_modules'],async () => {
      const backupHead = join(root,'.scanruler-backups',`previous-commit-${Date.now()}.txt`)
      await writeFile(backupHead,old+'\n')
    })
  } catch (error) {
    if (merged) await run('git',['reset','--keep',old],root)
    throw error
  } finally {
    // Only this invocation's temporary worktree can be removed.
    if (attached && stage.startsWith(temp + sep)) await run('git',['worktree','remove','--force',stage],root)
  }
}

export async function installUpdate(update, root = ROOT) {
  parseVersion(update.version)
  if (compareVersions(update.version,update.installed) <= 0 || !/^v?\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/.test(update.tag)) throw new Error('Некорректная версия обновления')
  const local = JSON.parse(await readFile(join(root,update.component.packageName === 'scanruler' ? 'package.json' : 'ru/package.json'),'utf8'))
  if (local.version !== update.installed) throw new Error('Установленная версия изменилась; повторите запуск')
  const lockPath = join(root, '.scanruler-update.lock')
  let lock
  try { lock = await open(lockPath, 'wx') } catch { throw new Error('Уже идёт обновление или остался файл .scanruler-update.lock после сбоя. Закройте другой обновлятор; после аварии удалите этот файл вручную.') }
  let tempBase, temp
  try {
    tempBase = await realpath(tmpdir())
    temp = await mkdtemp(join(tempBase,'scanruler-update-'))
    if (update.component.repo === 'CNCKitchen/scanruler') await installApp(update,root,temp)
    else if (update.component.repo === 'Evgeniy2225/scanruler-ru') await installRu(update,root,temp)
    else throw new Error('Неизвестный источник обновления')
  } finally {
    try {
      if (temp && temp.startsWith(tempBase + sep) && dirname(temp) === tempBase) await rm(temp,{recursive:true,force:true})
    } finally { await lock.close(); await rm(lockPath) }
  }
}
