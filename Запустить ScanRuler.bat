@echo off
chcp 65001 >nul
setlocal EnableExtensions
rem ScanRuler RU — запуск локальной русской версии ScanRuler.
rem Двойной щелчок: проверяет Node.js, при первом запуске ставит зависимости
rem и собирает приложение, подключает русификатор и открывает браузер.
cd /d "%~dp0"
title ScanRuler RU
set "PORT=7317"
set "URL=http://127.0.0.1:%PORT%/"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [!] Не найден Node.js. Установите Node.js 22 или новее с https://nodejs.org
  echo      ^(вариант LTS^), затем запустите этот файл снова.
  start "" "https://nodejs.org/"
  goto :fail
)
for /f %%v in ('node -p "process.versions.node.split('.')[0]"') do set "NODEMAJOR=%%v"
if %NODEMAJOR% LSS 22 (
  echo.
  echo  [!] Нужен Node.js 22 или новее, установлен %NODEMAJOR%. Обновите с https://nodejs.org
  start "" "https://nodejs.org/"
  goto :fail
)

if not exist "node_modules\" (
  echo  Первый запуск: устанавливаю зависимости, это займёт несколько минут...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :fail
)
if not exist "dist\index.html" (
  echo  Собираю ScanRuler, это займёт пару минут...
  call npm run build
  if errorlevel 1 goto :fail
)
node "ru\apply.mjs" "dist"
if errorlevel 1 goto :fail

rem Уже запущен (этим файлом или через Claude)? Тогда просто открываем браузер.
powershell -NoProfile -Command "try { if ((Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%URL%').Content -match 'scanruler-ru') { exit 0 } } catch {}; exit 1"
if not errorlevel 1 (
  echo  ScanRuler уже запущен — открываю %URL%
  start "" "%URL%"
  timeout /t 3 >nul
  exit /b 0
)

for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "[Environment]::GetFolderPath('MyDocuments')"`) do set "DOCS=%%d"
set "OUT=%DOCS%\ScanRuler"
if not exist "%OUT%" mkdir "%OUT%"

echo.
echo  ============================================================
echo   ScanRuler RU работает: %URL%
echo   Экспорт от Claude сохраняется в: %OUT%
echo   Alt+Shift+L в браузере — переключить язык RU/EN.
echo   Не закрывайте это окно, пока работаете. Закрыть — остановить.
echo  ============================================================
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 5; Start-Process '%URL%'"
call npx -y scanruler-mcp@latest --serve "%CD%\dist" --out "%OUT%"
exit /b 0

:fail
echo.
echo  Не получилось. Сообщение об ошибке — выше.
pause
exit /b 1
