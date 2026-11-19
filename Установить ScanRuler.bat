@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title Установка ScanRuler с русским интерфейсом
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Нужен Node.js 22 или новее: https://nodejs.org
  pause
  exit /b 1
)
node "ru\install-scanruler.mjs" --prompt
if errorlevel 20 (
  pause
  exit /b 0
)
if not "%errorlevel%"=="0" (
  echo Установка не завершена. Причина указана выше.
  pause
  exit /b 1
)
pause
exit /b 0
