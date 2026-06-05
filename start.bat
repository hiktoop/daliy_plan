@echo off
echo ==================================
echo   每日任务追踪 - 后端服务
echo ==================================
echo.
echo 启动地址: http://0.0.0.0:8888 （局域网访问用本机 IP）
echo 按 Ctrl+C 停止服务
echo.

cd /d "%~dp0"
" :: Listen on all interfaces for LAN access
" :: To access from other devices, use http://<your-local-ip>:8888
"C:\Users\19761\.workbuddy\binaries\python\versions\3.13.12\python.exe" -m uvicorn server:app --host 0.0.0.0 --port 8888
if not "%1"=="silent" pause
