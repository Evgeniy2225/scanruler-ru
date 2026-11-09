@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title Подключение ChatGPT к ScanRuler
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Нужен Node.js 22 или новее: https://nodejs.org
  pause
  exit /b 1
)
node "ru\connect-chatgpt.mjs"
if errorlevel 1 (
  echo Подключение не изменено или не завершено. Причина указана выше.
  pause
  exit /b 1
)
pause
exit /b 0
