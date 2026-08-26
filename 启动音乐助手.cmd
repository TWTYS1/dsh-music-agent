@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [dsh-music-agent] building plugin...
call pnpm exec tsc -p tsconfig.json || goto :fail
echo [dsh-music-agent] opening desktop window on http://127.0.0.1:3080
powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dsh-music-dev.ps1" gui
goto :eof

:fail
echo [dsh-music-agent] build failed. Fix the errors above, then run this again.
pause
