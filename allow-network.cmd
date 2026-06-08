@echo off
REM Opens the Windows Firewall so phones/tablets on your Wi-Fi can reach the
REM scoreboard. Right-click this file and choose "Run as administrator".
setlocal

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8080"

REM Re-launch elevated if we are not already administrator.
net session >nul 2>nul
if errorlevel 1 (
  echo Requesting administrator rights...
  powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0' -ArgumentList '%PORT%'"
  goto :eof
)

echo Allowing inbound TCP on port %PORT% through Windows Firewall...
netsh advfirewall firewall delete rule name="Padel Scoreboard %PORT%" >nul 2>nul
netsh advfirewall firewall add rule name="Padel Scoreboard %PORT%" dir=in action=allow protocol=TCP localport=%PORT% profile=private,domain

echo.
echo Done. Other devices on the same Wi-Fi can now open the admin page.
echo.
pause
