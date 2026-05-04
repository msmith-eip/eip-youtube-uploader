@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM EIP YouTube Uploader — Build and Publish to GitHub
REM Run this in Git Bash or Command Prompt to build + auto-publish the release
REM ─────────────────────────────────────────────────────────────────────────────

echo Building EIP YouTube Uploader and publishing to GitHub...
echo.

SET GH_TOKEN=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
SET CSC_IDENTITY_AUTO_DISCOVERY=false

npm run build
if %ERRORLEVEL% neq 0 (
  echo BUILD FAILED - check errors above
  pause
  exit /b 1
)

electron-builder --win --x64 --publish always

if %ERRORLEVEL% neq 0 (
  echo PUBLISH FAILED - check errors above
  pause
  exit /b 1
)

echo.
echo SUCCESS! Release published to GitHub.
echo Users will see the update notification next time they open the app.
pause
