@echo off
cd /d "%~dp0"
echo JK Database V7 - open http://localhost:8000 in your browser.
echo Keep this window open while using the app. Press Ctrl+C to stop.
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -m http.server 8000 --bind 127.0.0.1
  goto end
)
where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server 8000 --bind 127.0.0.1
  goto end
)
echo Python 3 was not found. Install Python 3 or use a static HTTPS host.
:end
pause
