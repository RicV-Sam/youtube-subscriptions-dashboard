@echo off
setlocal
title YouTube Dashboard Server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found. Please install Node.js first.
    pause
    exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
    echo Installing dashboard dependencies...
    call npm ci
    if errorlevel 1 (
        echo Dependency installation failed.
        pause
        exit /b 1
    )
)
node scripts\launch-dashboard.cjs %*
if errorlevel 1 pause
endlocal
