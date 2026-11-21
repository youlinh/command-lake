@echo off
setlocal
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 or newer is required.
  pause
  exit /b 1
)
pushd "%~dp0game" || exit /b 1
node scripts\dev.mjs --lan %*
set "game_exit=%errorlevel%"
popd
if not "%game_exit%"=="0" pause
exit /b %game_exit%
