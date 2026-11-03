@echo off
chcp 65001 >nul
rem Прописывает ScanRuler (сервер scanruler-mcp) в Claude Desktop и Claude Code.
cd /d "%~dp0"
title Подключение Claude к ScanRuler
powershell -NoProfile -ExecutionPolicy Bypass -File "ru\connect-claude.ps1"
pause
