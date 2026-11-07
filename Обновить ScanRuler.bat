@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"
title Обновление ScanRuler и русификатора
(
node "ru\check-updates.mjs" --install
echo.
echo После установки обновлений запустите «Запустить ScanRuler.bat» снова.
pause
exit /b 0
)
