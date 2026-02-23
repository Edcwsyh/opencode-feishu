# 实施计划：更新 README.md 并补充安装教程

**分支**: `main` | **日期**: 2026-02-23 | **规格**: [spec.md](./spec.md)

## 概要

将 README.md 从过时的"独立服务"描述更新为当前的"OpenCode 插件"架构，补充 npm 安装教程，更新架构图和项目结构，使其与实际代码 100% 一致。

## 技术上下文

**语言/版本**: TypeScript 5.5+
**构建工具**: tsup（ESM 输出，Node 20 目标）
**npm 包**: opencode-feishu@0.2.0（已发布到 npmjs.com）
**插件接口**: @opencode-ai/plugin >= 1.1.0
**目标**: 纯文档更新，不涉及代码变更

## 约定检查

| 约定 | 状态 |
|------|------|
| 不切新分支 | ✅ 在 main 分支 |
| 不需要单测 | ✅ 纯文档 |
| 文档用中文 | ✅ README 用中文 |

## 当前 README 问题清单

| # | 问题 | 影响 |
|---|------|------|
| 1 | 开头描述为"独立运行的飞书机器人服务" | 定位错误 |
| 2 | 架构图包含已删除模块（session/manager.ts, opencode/client.ts, opencode/events.ts） | 误导开发者 |
| 3 | 项目结构列出已删除文件（config.ts, opencode/, session/manager.ts） | 与代码不符 |
| 4 | 配置节描述 .env 环境变量和 feishu-bot.json | 已不使用 |
| 5 | "安装与运行"描述独立运行方式（npm start, node dist/index.js） | 不再适用 |
| 6 | 缺少 npm install 安装方式 | 新用户无法快速开始 |
| 7 | 缺少 OpenCode 插件配置说明 | 无法了解插件集成方式 |

## 实施任务

### T001：重写项目介绍（开头部分）

- 将"独立运行的飞书机器人服务"改为"OpenCode 的飞书插件"
- 更新主要能力列表，反映插件模式（通过 event 钩子接收事件，而非独立 SSE）
- 添加 npm 包地址徽章

### T002：更新架构图

当前实际模块结构：
```
src/
├── index.ts              # 插件入口：导出 FeishuPlugin
├── types.ts              # 类型定义
├── types/ws.d.ts         # WebSocket 类型声明
├── session.ts            # 会话管理（查找/创建 OpenCode 会话）
├── feishu/
│   ├── gateway.ts        # 飞书 WebSocket 网关
│   ├── sender.ts         # 飞书消息发送/更新/删除
│   ├── dedup.ts          # 消息去重（10 分钟窗口）
│   ├── group-filter.ts   # 群聊 @提及检测
│   └── history.ts        # 入群历史上下文摄入
└── handler/
    ├── chat.ts           # 对话处理（prompt、轮询、回复）
    └── event.ts          # OpenCode 事件处理（message.part.updated）
```

架构流程图需更新为：
```
OpenCode 加载插件 → index.ts (FeishuPlugin)
    ├── 读取 feishu.json → 初始化配置
    ├── fetchBotOpenId() → 获取 bot open_id
    └── startFeishuGateway() → 启动 WebSocket 长连接
        ├── im.message.receive_v1 → handleChat()
        │   ├── 静默监听: client.session.prompt({ noReply: true })
        │   └── 主动回复: client.session.prompt() → 轮询 → sender
        └── im.chat.member.bot.added_v1 → ingestGroupHistory()
    event 钩子 → handleEvent()
        └── message.part.updated → 实时更新飞书占位消息
```

### T003：重写安装教程

新增三种安装方式：
1. **npm 安装**（推荐）：`npm install opencode-feishu`
2. **本地开发安装**：junction/symlink 到 OpenCode 插件目录
3. **源码构建**：clone → npm install → npm run build

### T004：更新配置说明

当前配置方式：
- 在 `opencode.json` 中声明 `"plugin": ["opencode-feishu"]`
- 创建 `~/.config/opencode/plugins/feishu.json` 配置文件
- 配置文件内容：`{ "appId": "...", "appSecret": "..." }`
- 可选字段：timeout, thinkingDelay

### T005：更新项目结构

替换为 T002 中列出的实际文件结构。

### T006：更新/清理其余章节

- "安装与运行"→ 改为"开发指南"（面向贡献者）
- "本地打包与安装"→ 保留 npm pack 内容
- "配置说明"→ 按 T004 更新
- "对话流程说明"→ 移除 SSE 独立订阅描述，改为 event 钩子
- 保留：飞书开放平台配置、群聊行为、会话管理、常见问题
- 更新"常见问题"中的过时条目

### T007：补充日志文件说明

- 说明 debug 日志文件位置：`~/feishu-debug.log`（每次插件初始化时重建）
- 说明 OpenCode 日志系统：通过 `client.app.log()` 输出，service 标识为 `opencode-feishu`
- 说明 fallback 行为：OpenCode 日志不可用时降级到 console
