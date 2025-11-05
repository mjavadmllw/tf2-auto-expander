@echo off
title Project Setup

echo ========================================
echo   Running npm install...
echo ========================================
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] npm install failed!
    goto :end
)

echo.
echo ========================================
echo   Checking for config.json...
echo ========================================

if exist config.json (
    echo config.json already exists - skipping creation.
) else (
    echo Creating default config.json...
    (
        echo {
        echo     "USERNAME": "admin",
        echo     "PASSWORD": "password123"
        echo }
    ) > config.json
    echo config.json created with default credentials.
)

echo.
echo Setup completed successfully!
:end
echo.
echo Press any key to exit...
pause >nul