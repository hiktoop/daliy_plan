@echo off
:: 关闭每日任务追踪自启动
schtasks /change /tn "每日任务追踪" /disable
echo 自启动已关闭
pause
