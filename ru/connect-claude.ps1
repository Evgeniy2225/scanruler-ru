# ScanRuler RU — подключение Claude к ScanRuler (сервер scanruler-mcp).
# Прописывает сервер в Claude Desktop (claude_desktop_config.json) и, если
# установлен, в Claude Code. Перед изменением делает резервную копию.
# SPDX-License-Identifier: AGPL-3.0-only
$ErrorActionPreference = 'Stop'
try { Start-Transcript -Path (Join-Path $PSScriptRoot 'connect-claude.log') -Force | Out-Null } catch {}
trap { Write-Host " [!] Ошибка: $_" -ForegroundColor Red; try { Stop-Transcript | Out-Null } catch {}; break }
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'
$out  = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'ScanRuler'
if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }

$args_ = @('/c', 'npx', '-y', 'scanruler-mcp@latest', '--serve', $dist, '--out', $out)
$utf8 = New-Object System.Text.UTF8Encoding $false

Write-Host ''
Write-Host ' ScanRuler будет открываться у Claude в русской версии:' -ForegroundColor Cyan
Write-Host "   приложение: $dist"
Write-Host "   экспорт:    $out"
Write-Host ''

if (-not (Test-Path (Join-Path $dist 'index.html'))) {
  Write-Host ' [!] Нет собранного приложения в dist. Сначала один раз запустите «Запустить ScanRuler.bat».' -ForegroundColor Yellow
}

# --- Claude Desktop -------------------------------------------------------
# Где Claude Desktop хранит настройки, зависит от версии:
#  - новые версии из Microsoft Store: %LOCALAPPDATA%\Claude-Data\claude_*\
#  - старые версии из Store:          %LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\
#  - обычный установщик:              %APPDATA%\Claude\
# Если есть Claude-Data — настройки там, старую копию из Packages Claude уже не читает.
$dirs = @()
Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Claude-Data') -Directory -Filter 'claude*' -ErrorAction SilentlyContinue |
  ForEach-Object { $dirs += $_.FullName }
if (-not $dirs) {
  $dirs += Join-Path $env:APPDATA 'Claude'
  Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Packages') -Directory -Filter 'Claude_*' -ErrorAction SilentlyContinue |
    ForEach-Object { $dirs += Join-Path $_.FullName 'LocalCache\Roaming\Claude' }
  $dirs = @($dirs | Where-Object { Test-Path $_ })
}

if (-not $dirs) {
  Write-Host ' Claude Desktop не найден (нет папки настроек). Если он установлен, запустите его один раз и повторите.' -ForegroundColor Yellow
} else {
  foreach ($d in $dirs) {
    $cfg = Join-Path $d 'claude_desktop_config.json'
    & node (Join-Path $PSScriptRoot 'claude-config.mjs') $cfg $dist $out
    if ($LASTEXITCODE -eq 0) { Write-Host " Claude Desktop: сервер scanruler прописан в $cfg" -ForegroundColor Green }
    else { Write-Host " [!] Не удалось изменить $cfg" -ForegroundColor Red }
  }
  Write-Host ''
  Write-Host ' Теперь ПОЛНОСТЬЮ закройте Claude Desktop (значок у часов → Quit / Выход)' -ForegroundColor Yellow
  Write-Host ' и откройте снова — иначе настройка не подхватится.' -ForegroundColor Yellow
}

# --- Claude Code ----------------------------------------------------------
$ErrorActionPreference = 'Continue'
$claude = Get-Command claude -ErrorAction SilentlyContinue
if ($claude) {
  Write-Host ''
  try { & claude mcp remove scanruler --scope user *> $null } catch {}
  try {
    & claude mcp add --scope user scanruler -- cmd /c npx -y scanruler-mcp@latest --serve "$dist" --out "$out"
    if ($LASTEXITCODE -eq 0) { Write-Host ' Claude Code: сервер scanruler добавлен (для всех проектов).' -ForegroundColor Green }
    else { Write-Host ' [!] Claude Code не принял настройку — см. сообщение выше.' -ForegroundColor Yellow }
  } catch { Write-Host " [!] Claude Code: $_" -ForegroundColor Yellow }
} else {
  Write-Host ''
  Write-Host ' Claude Code не найден — пропускаю (это нормально, если вы им не пользуетесь).'
}

Write-Host ''
Write-Host ' Дальше: откройте Claude и напишите «Подключись к ScanRuler».' -ForegroundColor Cyan
Write-Host ' В первый раз ScanRuler предупредит, что данные, которые читает агент, уходят его модели,'
Write-Host ' — нажмите «Подключить агента». Если браузер спросит про доступ к устройствам — «Разрешить».'
Write-Host ''
try { Stop-Transcript | Out-Null } catch {}
