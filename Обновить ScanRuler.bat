@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title Обновление ScanRuler и русификатора
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Нужен Node.js 22 или новее: https://nodejs.org
  pause
  exit /b 1
)
rem Блок читается до обновления: установщик может заменить этот BAT-файл.
(
  node "ru\check-updates.mjs" --install
  if errorlevel 20 (
    echo Обновление установлено. Запустите «Запустить ScanRuler.bat» снова.
    pause
    exit /b 0
  )
  if errorlevel 1 (
    echo Проверка или установка обновления не завершена. Причина указана выше.
    pause
    exit /b 1
  )
  echo Проверка завершена. Если обновление не установлено, текущая версия сохранена.
  pause
  exit /b 0
)
