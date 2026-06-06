# 手机端部署指南

## 环境要求

- Android 手机 + Termux
- WiFi 网络（手机和电脑在同一局域网）
- SSH 配置：`~/.ssh/config` 中配置 `phone` 主机

## 首次部署

### 1. 手机端安装依赖

```bash
# 安装 Rust 编译器（pydantic-core 需要）
pkg install rust binutils

# 安装 Python 包
pip install fastapi uvicorn
```

### 2. 电脑端执行部署

```bash
cd /path/to/daliy_plan
bash deploy-to-phone.sh
```

这会：
- 同步代码到手机 `~/daily-plan/`
- 安装依赖
- 启动服务

## 访问地址

- 手机本地：`http://127.0.0.1:8888`
- 局域网：`http://192.168.10.2:8888`（IP 可能变化）

## 日常管理

```bash
# 查看状态
bash deploy-to-phone.sh status

# 停止服务
bash deploy-to-phone.sh stop

# 启动服务
bash deploy-to-phone.sh start

# 仅同步代码（不重启）
bash deploy-to-phone.sh sync
```

## 开机自启

安装 Termux:Boot（从 F-Droid）可实现开机自启。

自启动脚本已创建在手机端：`~/.termux/boot/start-daily-plan.sh`

## 故障排查

### 手机 IP 变化

如果路由器分配了新的 IP，更新 `deploy-to-phone.sh` 中的 `PHONE_IP` 变量。

建议：在路由器设置静态 IP 绑定（根据手机 MAC 地址）。

### 端口被占用

```bash
ssh phone "lsof -i :8888"
```

### 服务无响应

```bash
ssh phone "pgrep -f uvicorn"
ssh phone "cat ~/daily-plan/server.log"
```
