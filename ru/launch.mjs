// SPDX-License-Identifier: AGPL-3.0-only
import { readFile, access } from 'node:fs/promises'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

export async function isOurPage(url, root, fetchImpl = fetch) {
  try {
    const [page, script] = await Promise.all(['', 'scanruler-ru.js'].map(path => fetchImpl(url + path, {signal: AbortSignal.timeout(1500)})))
    return page.ok && script.ok &&
      await page.text() === await readFile(join(root, 'dist/index.html'), 'utf8') &&
      await script.text() === await readFile(join(root, 'dist/scanruler-ru.js'), 'utf8')
  } catch { return false }
}

function openBrowser(url) {
  if (process.argv.includes('--no-browser')) return
  const child = spawn('explorer.exe', [url], {
    detached: true, windowsHide: true, stdio: 'ignore',
  })
  child.on('error', () => console.log(`Откройте в браузере: ${url}`))
  child.unref()
}

export async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  await access(join(root, 'dist/index.html'))
  const base = 'http://127.0.0.1:7318/'
  if (await isOurPage(base, root)) {
    console.log(`ScanRuler уже запущен: ${base}`)
    openBrowser(base)
    process.exitCode = 21 // Let the BAT explain why a second server is not started.
    return
  }
  // Vite is already a dependency of ScanRuler. Do not use MCP's service port for the UI.
  const { preview } = await import(pathToFileURL(join(root, 'node_modules/vite/dist/node/index.js')).href)
  const app = await preview({root, preview: {host: '127.0.0.1', port: 7318, strictPort: false, open: false}})
  const port = app.httpServer.address().port
  const url = `http://127.0.0.1:${port}/`
  console.log(`\nScanRuler RU работает: ${url}`)
  console.log('Alt+Shift+L — переключение языка. Не закрывайте это окно, пока работаете.')
  console.log('Подключение агента при необходимости включается в настройках ScanRuler.\n')
  openBrowser(url)
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.httpServer.close(() => process.exit(0)))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {console.error(`Не удалось запустить ScanRuler: ${error.message}`); process.exitCode = 1})
}
