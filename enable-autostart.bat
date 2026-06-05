@echo off
:: 开启每日任务追踪自启动
schtasks /change /tn "每日任务追踪" /enable
echo 自启动已开启 — 下次登录时自动运行
pause
