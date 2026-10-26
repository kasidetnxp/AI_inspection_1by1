@echo off
setlocal
cd /d "%~dp0"
title Wafer AI Inspection System Launcher

powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0start.ps1" %*

if errorlevel 1 (
    echo:
    echo [ERROR] Launcher encountered an error.
    pause
    exit /b %ERRORLEVEL%
)
