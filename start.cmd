@echo off
REM Launch the OBS Padel Scoreboard.
REM Uses a system "node" if available, otherwise the portable Node in .node\.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if %ERRORLEVEL%==0 (
  node server.js
  goto :eof
)

set "NODE_EXE="
for /r "%~dp0.node" %%F in (node.exe) do if exist "%%F" set "NODE_EXE=%%F"
if defined NODE_EXE (
  echo Using portable Node: %NODE_EXE%
  "%NODE_EXE%" server.js
) else (
  echo Node.js was not found. Install it from https://nodejs.org/ ^(LTS^) and run start.cmd again.
  pause
)
