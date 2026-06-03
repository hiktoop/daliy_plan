@echo off
echo ==================================
echo   每日任务追踪 - 后端服务
echo ==================================
echo.
echo 启动地址: http://127.0.0.1:8888
echo 按 Ctrl+C 停止服务
echo.

cd /d "%~dp0"
"C:\Users\19761\.workbuddy\binaries\python\versions\3.13.12\python.exe" -m uvicorn server:app --host 127.0.0.1 --port 8888
pause
