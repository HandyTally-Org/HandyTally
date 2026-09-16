@echo off
rem Starts the Expo web dev server with Node on PATH, for .claude/launch.json.
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0..\web"
call "C:\Program Files\nodejs\npx.cmd" expo start --web --port 8081
