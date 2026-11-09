@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title Подключение Claude к ScanRuler
powershell -NoProfile -ExecutionPolicy Bypass -File "ru\connect-claude.ps1"
if errorlevel 1 (
  echo Подключение не завершено. Причина указана выше.
  pause
  exit /b 1
)
pause
exit /b 0
