@echo off
chcp 65001 >nul
setlocal EnableExtensions
rem Обновляет ScanRuler с GitHub, пересобирает и заново подключает русификатор.
cd /d "%~dp0"
title Обновление ScanRuler
where git >nul 2>nul
if errorlevel 1 ( echo  [!] Не найден Git — скачайте новую версию вручную с https://github.com/CNCKitchen/scanruler & goto :fail )
echo  Получаю обновления с GitHub...
git -c core.autocrlf=true pull --ff-only
if errorlevel 1 (
  echo  [!] git pull не прошёл. Если вы меняли файлы ScanRuler, верните их: git checkout -- .
  goto :fail
)
echo  Устанавливаю зависимости...
call npm install --no-audit --no-fund
if errorlevel 1 goto :fail
echo  Собираю...
call npm run build
if errorlevel 1 goto :fail
node "ru\build.mjs"
node "ru\apply.mjs" "dist"
if errorlevel 1 goto :fail
echo.
echo  Готово. Новые английские строки, которых ещё нет в словаре, останутся на английском —
echo  их список: в браузере F12 → Console → scanrulerRu.missing()
pause
exit /b 0
:fail
pause
exit /b 1
