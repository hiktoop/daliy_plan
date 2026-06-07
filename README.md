# 每日任务追踪

FastAPI + SQLite + 纯前端模块化架构的每日任务管理平台。

## 功能模块

| 模块 | 说明 |
|------|------|
| 每日事项 | 任务增删改查、标签、艾宾浩斯复习提醒 |
| 习惯养成 | 习惯打卡、连续天数、12周热力图 |
| 专注时间 | 正计时/倒计时、环形进度条、历史记录 |
| 图表分析 | 完成趋势、任务分布、专注时长可视化 |
| 每日句子 | 从 GitHub 仓库随机获取每日句子/方法论 |

## 外部依赖

### quotes 仓库（每日句子数据源）

本项目依赖 [hiktoop/quotes](https://github.com/hiktoop/quotes) 仓库提供每日句子与方法论内容。

- **用途**：首页日期栏下方每日随机展示一句句子或方法论
- **数据格式**：`quotes.md`，按 `## 句子` / `## 方法论` 分节，每节内用 `1. 2. 3.` 编号列表
- **拉取方式**：前端 `static/quotes.js` 直接 fetch GitHub raw URL，**无需后端参与**
- **URL 配置**：修改 `static/quotes.js` 中的 `QUOTES_RAW_URL` 变量

```js
// static/quotes.js
const QUOTES_RAW_URL = 'https://raw.githubusercontent.com/hiktoop/quotes/main/quotes.md';
```

## 技术栈

- **后端**：Python 3.13 + FastAPI + SQLite
- **前端**：原生 JS（ES Modules）+ Chart.js
- **部署**：本地 `start.bat`（端口 8888）/ 手机 Termux

## 快速启动

```bash
# 安装依赖
pip install fastapi uvicorn

# 启动服务（端口 8888）
python -m uvicorn server:app --host 0.0.0.0 --port 8888
# 或直接双击 start.bat
```

访问 `http://localhost:8888`

## 目录结构

```
├── server.py              # 后端入口（FastAPI）
├── backend/              # 后端模块
│   ├── db.py            # SQLite 初始化
│   ├── main.py          # FastAPI app + CORS
│   ├── models.py        # Pydantic 模型
│   └── routes/          # API 路由
├── static/              # 前端
│   ├── index.html       # 主页面
│   ├── app.js           # 全局状态 + 页面切换
│   ├── api.js           # API 封装
│   ├── render.js        # 渲染函数
│   ├── actions.js       # 操作函数
│   ├── quotes.js        # 每日句子（依赖外部仓库）
│   └── style.css       # 样式
├── data/                # SQLite 数据库（不提交 git）
└── start.bat            # Windows 启动脚本
```

## 版本历史

| 版本 | 说明 |
|------|------|
| v12 | 每日句子功能（方案C：前端直取 GitHub Raw） |
| v11 | 习惯养成模块（打卡、热力图、连续天数） |
| v10 | 移除专注记录删除功能 |
| v9  | 计时器使用浏览器本地时间，修复时钟不同步 |
| v8  | 图表页面移动端修复 |
| v7  | 专注页面改进（正计时/倒计时二选一、记录铺满宽度） |
