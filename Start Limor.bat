@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

:: Read assistant name from .env (fallback: Limor)
set "BOT_NAME=Limor"
if exist ".env" (
    for /f "usebackq tokens=2 delims==" %%a in (`findstr /B "BOT_NAME_EN=" .env`) do set "BOT_NAME=%%a"
)
set "BOT_NAME_LOWER=%BOT_NAME%"

title %BOT_NAME% - Starting...

echo.
echo   ========================================
echo   %BOT_NAME% - Personal AI WhatsApp Assistant
echo   ========================================
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo   [ERROR] Node.js not found! Install from https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Check if dependencies are installed
if not exist "node_modules" (
    echo   [INFO] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo   [ERROR] npm install failed!
        pause
        exit /b 1
    )
)

:: Build
echo   [1/4] Building...
call npm run build
if errorlevel 1 (
    echo   [ERROR] Build failed!
    pause
    exit /b 1
)
echo   [1/4] Build OK

:: Start bot with PM2
echo   [2/4] Starting bot with PM2...
call npx pm2 start ecosystem.config.js 2>nul || call npx pm2 restart %BOT_NAME_LOWER% 2>nul
echo   [2/4] Bot started

:: Start dashboard
echo   [3/4] Starting dashboard on port 3848...
cd dashboard
if not exist "node_modules" (
    echo   [INFO] Installing dashboard dependencies...
    call npm install
)
start /b cmd /c "npm run dev >nul 2>&1"
cd ..
echo   [3/4] Dashboard starting...

:: Open browser
echo   [4/4] Opening dashboard in browser...
timeout /t 5 /nobreak >nul
start http://localhost:3848

echo.
echo   ========================================
echo   %BOT_NAME% is running!
echo.
echo   Dashboard: http://localhost:3848
echo   Bot logs:  npx pm2 logs
echo   Stop:      npx pm2 stop all
echo   ========================================
echo.
echo   Press any key to close this window
echo   (the bot will keep running in the background)
echo.
pause >nul
