@echo off
setlocal
cd /d "%~dp0"
title Premium Collection By Sanjida - Starter

where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js is not installed.
  echo Please install Node.js LTS first.
  echo.
  pause
  exit /b 1
)

echo Starting Premium Collection By Sanjida...
if not exist "node_modules\express" (
  echo Installing required files... Please wait.
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Please run this file again.
    pause
    exit /b 1
  )
)

rem Start the Node server in a separate window. No nested cd/quote command is used.
start "Premium Collection By Sanjida Server" cmd /c npm start

echo Waiting for website to start...
for /l %%i in (1,1,30) do (
  powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://localhost:10000/health' -TimeoutSec 1; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 (
    start "" "http://localhost:10000/?store=1"
    echo.
    echo Website is ready: http://localhost:10000/
    exit /b 0
  )
  timeout /t 1 /nobreak >nul
)

echo.
echo Website did not start on port 10000.
echo Check the server window for the error.
pause
