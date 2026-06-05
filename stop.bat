@echo off
echo 正在停止每日任务追踪服务...
taskkill /f /im python.exe /fi "WINDOWTITLE eq *uvicorn*" 2>nul
echo 已停止（如未找到对应进程，说明服务未在运行）
pause
