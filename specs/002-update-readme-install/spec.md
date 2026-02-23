# 功能规格说明：更新 README.md 并补充安装教程

**功能分支**: `main`（根据约定，所有变更在当前分支）
**创建日期**: 2026-02-23
**状态**: Draft
**输入**: 用户描述: "更新README.md，并补充安装教程"

## 用户场景与测试

### 用户故事 1 - 新用户通过 npm 安装插件（优先级: P1）

用户发现 opencode-feishu 插件（通过 npm 搜索或文档链接），希望快速安装并接入自己的 OpenCode 环境。

**为何此优先级**：这是最常见的用户入口路径，直接影响插件的采用率。

**独立测试**：新用户按照 README 安装步骤，从零完成插件安装和首次对话。

**验收场景**：

1. **Given** 用户已安装 OpenCode 且已有飞书自建应用，**When** 按照 README 中的"快速开始"步骤执行 `npm install opencode-feishu`，**Then** 插件安装成功，README 中的后续配置步骤清晰可操作
2. **Given** 用户完成安装和配置，**When** 启动 OpenCode，**Then** 飞书插件自动加载，用户可在飞书中与 AI 对话

---

### 用户故事 2 - 开发者了解插件架构和能力（优先级: P2）

开发者（或潜在贡献者）打开 README，希望快速理解项目定位、架构和核心能力。

**为何此优先级**：准确的项目描述建立正确预期，减少误解和无效支持请求。

**独立测试**：开发者阅读 README 后能准确描述项目定位（OpenCode 插件而非独立服务）。

**验收场景**：

1. **Given** 开发者打开 README，**When** 阅读项目介绍，**Then** 明确了解这是 OpenCode 的飞书插件（不是独立服务）
2. **Given** 开发者查看架构图，**When** 对照实际代码结构，**Then** 架构图与代码文件一一对应，无过时模块

---

### 用户故事 3 - 开发者本地开发和调试插件（优先级: P2）

开发者 clone 项目后，希望在本地进行开发和调试。

**为何此优先级**：开发体验直接影响社区贡献意愿。

**独立测试**：开发者按照 README 中的开发指南，完成本地构建和调试。

**验收场景**：

1. **Given** 开发者 clone 了仓库，**When** 按照开发指南执行构建命令，**Then** 项目构建成功
2. **Given** 开发者需要调试，**When** 查看 README 中的开发模式说明，**Then** 能成功运行 dev 模式并连接到 OpenCode

---

### 边缘情况

- README 中提到的旧版独立服务模式内容全部移除或更新，不留歧义
- 安装步骤覆盖 Windows 和 macOS/Linux 两种平台
- 配置示例中不包含真实的 App ID/Secret

## 需求

### 功能需求

- **FR-001**: README 必须将项目定位更新为"OpenCode 飞书插件"，移除"独立运行的飞书机器人服务"描述
- **FR-002**: README 必须包含通过 npm 安装的命令（`npm install opencode-feishu`）
- **FR-003**: README 必须包含完整的 OpenCode 插件配置步骤（opencode.json 配置、feishu.json 配置文件）
- **FR-004**: README 必须包含飞书开放平台配置指南（创建应用、添加机器人、事件订阅、权限配置）
- **FR-005**: README 的架构图必须反映当前插件架构（移除已删除模块：config.ts、session/manager.ts、opencode/client.ts、opencode/events.ts）
- **FR-006**: README 的项目结构必须与当前源码文件一致
- **FR-007**: README 必须包含本地开发指南（clone、安装依赖、构建、dev 模式）
- **FR-008**: README 必须包含配置说明，反映当前配置方式（~/.config/opencode/plugins/feishu.json）
- **FR-009**: README 必须保留群聊行为、会话管理、常见问题等实用内容，并更新过时细节
- **FR-010**: README 必须说明当前插件的日志文件位置（~/feishu-debug.log）和 OpenCode 日志系统输出方式

### 关键实体

- **README.md**: 项目根目录的主文档，npm 包页面自动展示
- **opencode.json**: OpenCode 配置文件，声明插件
- **feishu.json**: 飞书插件配置文件，存放 appId/appSecret

## 成功标准

- **SC-001**: 新用户按照 README 步骤，15 分钟内完成从安装到首次飞书对话
- **SC-002**: README 中的项目结构、架构图与实际代码 100% 一致
- **SC-003**: README 中无任何对已删除模块（config.ts、session/manager.ts、opencode/client.ts、opencode/events.ts）的引用
- **SC-004**: npm 包页面（https://www.npmjs.com/package/opencode-feishu）展示的 README 内容完整、可读
