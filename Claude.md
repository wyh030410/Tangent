# 多轨对话系统 (Multi-thread Chat)

## 项目简介
解决 Claude 对话中"追问细节会污染主线上下文"的问题。
用户可以在主线对话的同时，开启独立的气泡对话追问细节，两者上下文完全隔离。

## 核心功能
- 主线对话：主要任务的对话，上下文完整保留
- 气泡对话：独立的追问窗口，不影响主线
- 联网搜索：集成 Tavily，让 Claude 能获取最新信息

## 技术栈
- 后端：Python + Flask + Anthropic SDK
- 前端：纯 HTML + CSS + JS
- 搜索：Tavily API

## 项目结构
```
project/
├── CLAUDE.md          # 本文件
├── app.py             # Flask 后端入口
├── .env               # API Keys（不提交git）
├── requirements.txt   # Python依赖
└── static/
    ├── index.html     # 前端页面
    ├── style.css      # 样式
    └── app.js         # 前端逻辑
```

## 本地运行
```bash
pip install -r requirements.txt
python app.py
# 访问 http://localhost:5000
```

## 环境变量
```
ANTHROPIC_API_KEY=你的key
TAVILY_API_KEY=你的key
```

## 开发规范
- 每个对话线程用独立的 messages 数组维护
- 后端不存储对话历史，由前端维护并每次请求时传入
- API 路由统一以 /api 开头
