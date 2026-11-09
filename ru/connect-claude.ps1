# SPDX-License-Identifier: AGPL-3.0-only
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$exitCode = 0
try {
  $nodeExe = (Get-Command node -ErrorAction Stop).Source
  $root = Split-Path -Parent $PSScriptRoot
  $dist = Join-Path $root 'dist'
  if (-not (Test-Path -LiteralPath (Join-Path $dist 'index.html'))) { throw 'Сначала запустите «Запустить ScanRuler.bat», чтобы создать сборку dist.' }
  $manifest = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($manifest.name -ne 'scanruler') { throw 'BAT и папка ru должны находиться в папке самого ScanRuler.' }
  $out = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'ScanRuler'
  $helper = Join-Path $PSScriptRoot 'claude-config.mjs'
  $entryText = & $nodeExe $helper --entry $out
  if ($LASTEXITCODE -ne 0) { throw 'Не удалось подготовить команду MCP. См. сообщение выше.' }
  $entry = $entryText | ConvertFrom-Json

  # Prefer the current Store profile. Fall back to the traditional and older Store paths.
  $dirs = @()
  Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'Claude-Data') -Directory -Filter 'claude*' -ErrorAction SilentlyContinue |
    ForEach-Object { $dirs += $_.FullName }
  if (-not $dirs) {
    $dirs += Join-Path $env:APPDATA 'Claude'
    Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'Packages') -Directory -Filter 'Claude_*' -ErrorAction SilentlyContinue |
      ForEach-Object { $dirs += Join-Path $_.FullName 'LocalCache\Roaming\Claude' }
    $dirs = @($dirs | Where-Object { Test-Path -LiteralPath $_ -PathType Container })
  }
  $dirs = @($dirs | Select-Object -Unique)
  $claudeCommand = Get-Command claude -ErrorAction SilentlyContinue
  Write-Host ' Интерфейс ScanRuler: http://127.0.0.1:7318/'
  Write-Host " Экспорт: $out"
  if ($CheckOnly) {
    Write-Host " Проверка без записи. Папок Claude Desktop: $($dirs.Count). Claude Code: $([bool]$claudeCommand)."
    Write-Host " Node.js и npm найдены; сборка ScanRuler готова."
    exit 0
  }
  $success = 0
  if (-not $dirs) { Write-Host ' Claude Desktop не найден. Если он установлен, откройте его один раз и повторите.' }
  foreach ($dir in $dirs) {
    $cfg = Join-Path $dir 'claude_desktop_config.json'
    & $nodeExe $helper --write $cfg $out
    if ($LASTEXITCODE -eq 0) { $success++ }
    else { $exitCode = 1; Write-Host " [!] Не удалось настроить Claude Desktop: $cfg" -ForegroundColor Red }
  }
  if ($claudeCommand) {
    # An existing server may hold custom permissions or point to a different installation.
    # Never remove it before a replacement has been installed successfully.
    $ErrorActionPreference = 'Continue'
    & $claudeCommand.Source mcp get scanruler *> $null
    $alreadyExists = $LASTEXITCODE -eq 0
    $ErrorActionPreference = 'Stop'
    if ($alreadyExists) {
      Write-Host ' Claude Code: scanruler уже есть; настройки сохранены без изменений. При необходимости проверьте адрес через claude mcp get scanruler.'
      $success++
    } else {
      $commandArgs = @('mcp','add','--scope','user','--transport','stdio','scanruler','--',$entry.command) + @($entry.args)
      & $claudeCommand.Source @commandArgs
      if ($LASTEXITCODE -eq 0) { $success++; Write-Host ' Claude Code: сервер добавлен для всех проектов.' }
      else { $exitCode = 1; Write-Host ' [!] Claude Code не добавил сервер. Существующие подключения не удалялись.' -ForegroundColor Red }
    }
  } else { Write-Host ' Claude Code не найден; пропускаю.' }
  if ($success -eq 0) { throw 'Ни одного подключения не настроено. Установите и один раз откройте Claude Desktop или Claude Code.' }
  Write-Host ''
  Write-Host ' Полностью закройте Claude Desktop через Выход / Quit и откройте снова. Claude Code тоже перезапустите.'
  Write-Host ' Запустите «Запустить ScanRuler.bat», затем попросите Claude подключиться к открытой странице.'
  Write-Host ' Подтвердите подключение агента в ScanRuler. Для другого порта используйте адрес из консоли и включите подключение локального агента в настройках.'
  Write-Host ' При первом подключении нужен интернет для загрузки scanruler-mcp.'
} catch {
  Write-Host " [!] $($_.Exception.Message)" -ForegroundColor Red
  $exitCode = 1
}
exit $exitCode
