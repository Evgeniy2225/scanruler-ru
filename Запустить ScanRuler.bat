@echo off
chcp 65001 >nul
setlocal EnableExtensions
rem ScanRuler RU — запуск локальной русской версии ScanRuler.
rem Двойной щелчок: проверяет Node.js, при первом запуске ставит зависимости
rem и собирает приложение, подключает русификатор и открывает браузер.
cd /d "%~dp0"
title ScanRuler RU

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

rem Предлагает установить найденные обновления; Enter — пропустить.
rem Блок читается до установки: BAT-файл может быть заменён обновлением.
(
  node "ru\check-updates.mjs" --install
  if errorlevel 20 (
    echo  Обновление установлено. Запустите этот BAT-файл снова.
    pause
    exit /b 0
  )
  if errorlevel 1 echo  [!] Проверка обновлений не выполнена. Продолжаю запуск.
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

rem Интерфейс работает отдельно от MCP на порту 7318.
node "ru\launch.mjs"
if errorlevel 21 (
  echo  Программа уже работает в другом окне. Браузер открыт повторно.
  echo  Это окно можно закрыть. Основное окно ScanRuler оставьте открытым.
  pause
  exit /b 0
)
if errorlevel 1 goto :fail
exit /b 0

:fail
echo.
echo  Не получилось. Сообщение об ошибке — выше.
pause
exit /b 1
