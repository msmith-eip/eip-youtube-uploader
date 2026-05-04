@echo off
echo ========================================
echo   EIP YouTube Uploader - Windows Build
echo ========================================
echo.

echo Installing dependencies...
call npm install

echo Building app (React + Electron)...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npm run dist:win

echo.
if exist "release\EIP YouTube Uploader Setup 1.0.0.exe" (
    echo ========================================
    echo  SUCCESS! Installer ready:
    echo  release\EIP YouTube Uploader Setup 1.0.0.exe
    echo ========================================
) else (
    echo Build complete. Check the release\ folder.
    dir release\
)
pause
