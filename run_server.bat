@echo off
title SMART REM - Medicine Reminder Server
color 0A

echo ================================================================
echo           SMART REM - Medicine Reminder System
echo                Starting Backend IoT Server...
echo ================================================================
echo.

cd backend
if not exist node_modules (
    echo [INFO] Installing NPM dependencies...
    call npm install
)

echo [INFO] Starting Node.js Server on port 3000...
echo [INFO] Open your web browser at: http://localhost:3000
echo.

start http://localhost:3000
node server.js

pause
