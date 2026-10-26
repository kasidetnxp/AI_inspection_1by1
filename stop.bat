@echo off
setlocal
cd /d "%~dp0"
title Wafer AI Inspection System Shutdown

powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0stop.ps1" %*

if errorlevel 1 (
    echo:
    echo [ERROR] Shutdown encountered an error.
    pause
    exit /b %ERRORLEVEL%
)
