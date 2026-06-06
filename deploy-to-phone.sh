#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# deploy-to-phone.sh — 一键部署每日任务追踪到 Termux 手机
# 用法: bash deploy-to-phone.sh [start|stop|status|sync]
#   (无参数)  — 完整部署并启动
#   start     — 仅启动已部署的服务
#   stop      — 停止手机端服务
#   status    — 查看手机端服务状态
#   sync      — 仅同步文件，不重启
# ═══════════════════════════════════════════════════════════════

set -e

# ── 配置 ──
SSH_HOST="phone"
APP_DIR="/data/data/com.termux/files/home/daily-plan"
PORT=8888
PHONE_IP="192.168.10.2"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERR]${NC} $1"; exit 1; }

# ── 函数: 检查 SSH 连接 ──
check_ssh() {
    if ! ssh -o ConnectTimeout=5 -o BatchMode=yes "$SSH_HOST" "echo ok" &>/dev/null; then
        err "无法连接到手机 (ssh $SSH_HOST)。请确保:\n  - 手机已连接 WiFi\n  - Termux 已安装 openssh (pkg install openssh)\n  - sshd 已启动 (sshd)\n  - ~/.ssh/config 已配置 'phone' 主机"
    fi
    ok "SSH 连接正常"
}

# ── 函数: 检查手机是否在线，服务是否运行 ──
check_service() {
    ssh "$SSH_HOST" "pgrep -f 'uvicorn server:app' > /dev/null 2>&1" 2>/dev/null
}

# ── 函数: 安装手机端依赖 ──
install_deps() {
    info "安装 Python 依赖..."
    # Termux aarch64 无 pydantic-core 预编译包，用 pkg 装二进制版本
    ssh "$SSH_HOST" "pkg install -y python-fastapi python-uvicorn 2>&1 | tail -3"
    ok "依赖安装完成"
}

# ── 函数: 同步文件 ──
sync_files() {
    info "同步项目文件到手机..."

    # 确保目标目录存在
    ssh "$SSH_HOST" "mkdir -p '$APP_DIR/data' '$APP_DIR/backend/routes' '$APP_DIR/static'"

    # 用 tar+ssh 管道传输（比 scp 逐文件快，不依赖 rsync）
    tar czf - \
        --exclude='.git' \
        --exclude='.workbuddy' \
        --exclude='__pycache__' \
        --exclude='*.pyc' \
        --exclude='data/*.db' \
        --exclude='deploy-to-phone.sh' \
        --exclude='start.bat' \
        --exclude='stop.bat' \
        --exclude='enable-autostart.bat' \
        --exclude='disable-autostart.bat' \
        --exclude='README.md' \
        backend server.py static 2>/dev/null \
        | ssh "$SSH_HOST" "tar xzf - -C '$APP_DIR/'"

    ok "文件同步完成"
}

# ── 函数: 启动服务 ──
start_service() {
    info "启动手机端服务..."

    if check_service; then
        warn "服务已在运行中"
        show_status
        return
    fi

    ssh "$SSH_HOST" bash -c "
        cd '$APP_DIR'
        # 确保 data 目录存在
        mkdir -p data

        # 后台启动 uvicorn (系统 Python，无 venv)
        # server:app 等价于 backend.main:app，更短
        nohup python3 -m uvicorn server:app \
            --host 0.0.0.0 \
            --port $PORT \
            > /dev/null 2>&1 &

        # 等待启动
        sleep 2

        if pgrep -f 'uvicorn server:app' > /dev/null; then
            echo 'SERVICE_STARTED'
        else
            echo 'SERVICE_FAILED'
        fi
    "

    sleep 1
    if check_service; then
        ok "服务启动成功！"
        echo ""
        echo -e "  ${GREEN}访问地址: http://${PHONE_IP}:${PORT}${NC}"
        echo -e "  ${GREEN}手机本地:  http://127.0.0.1:${PORT}${NC}"
        echo ""
    else
        err "服务启动失败，请检查日志"
    fi
}

# ── 函数: 停止服务 ──
stop_service() {
    info "停止手机端服务..."
    # pkill 在找不到进程时会返回非零，所以 || true
    ssh "$SSH_HOST" "pkill -f 'uvicorn server:app' 2>/dev/null; true"
    sleep 1
    if check_service; then
        warn "尝试强制终止..."
        ssh "$SSH_HOST" "pkill -9 -f 'uvicorn server:app' 2>/dev/null; true"
        sleep 1
    fi
    if ! check_service; then
        ok "服务已停止"
    else
        warn "服务可能仍在运行"
    fi
}

# ── 函数: 显示状态 ──
show_status() {
    echo ""
    echo -e "${CYAN}══════ 手机端服务状态 ══════${NC}"
    if check_service; then
        local pid=$(ssh "$SSH_HOST" "pgrep -f 'uvicorn server:app'" 2>/dev/null)
        echo -e "  状态:   ${GREEN}运行中${NC} (PID: $pid)"
        echo -e "  地址:   ${GREEN}http://${PHONE_IP}:${PORT}${NC}"

        # 检查是否能访问
        if curl -s -o /dev/null -w "%{http_code}" "http://${PHONE_IP}:${PORT}" 2>/dev/null | grep -q "200\|302"; then
            echo -e "  响应:   ${GREEN}正常${NC}"
        else
            echo -e "  响应:   ${YELLOW}无响应 (可能防火墙？)${NC}"
        fi
    else
        echo -e "  状态:   ${YELLOW}未运行${NC}"
    fi
    echo -e "${CYAN}════════════════════════════${NC}"
    echo ""
}

# ── 主流程 ──
CMD="${1:-deploy}"

case "$CMD" in
    start)
        check_ssh
        start_service
        ;;
    stop)
        check_ssh
        stop_service
        ;;
    status)
        check_ssh
        show_status
        ;;
    sync)
        check_ssh
        sync_files
        ok "同步完成。如需重启: bash deploy-to-phone.sh start"
        ;;
    deploy|*)
        echo ""
        echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
        echo -e "${CYAN}║   每日任务追踪 — 手机端部署           ║${NC}"
        echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
        echo ""

        # 1. 检查连接
        check_ssh

        # 2. 停止旧服务（如果有）
        if check_service; then
            info "检测到旧服务正在运行，先停止..."
            stop_service
        fi

        # 3. 同步文件
        sync_files

        # 4. 安装依赖
        install_deps

        # 5. 启动服务
        start_service

        echo -e "  ${CYAN}管理命令:${NC}"
        echo -e "    bash deploy-to-phone.sh status  — 查看状态"
        echo -e "    bash deploy-to-phone.sh stop    — 停止服务"
        echo -e "    bash deploy-to-phone.sh sync    — 同步代码"
        echo -e "    bash deploy-to-phone.sh start   — 手动启动"
        ;;
esac
