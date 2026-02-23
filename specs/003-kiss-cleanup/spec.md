# 功能规格说明：KISS 原则代码清理

**功能分支**: `main`（根据约定，所有变更在当前分支）
**创建日期**: 2026-02-23
**状态**: Draft

## 问题总览

代码中存在大量调试诊断代码、冗余 fallback、死代码和重复模式，违反 KISS 原则。以下按严重程度分类。

---

## 问题 1：index.ts 包含 ~130 行无用的 WebSocket 诊断代码（严重）

**文件**: `src/index.ts`
**涉及函数**: `probeWsConfig()`、`debugWsConnect()`、`redactWsUrl()`

这三个函数共约 130 行，每次插件启动时：
1. 手动调用飞书 WS endpoint API 获取 WebSocket URL
2. 自行建立一个独立的 WebSocket 连接做连通性测试
3. 做 DNS 解析诊断
4. 然后关闭这个连接

**问题**：Lark SDK 的 `WSClient` 已经完整处理 WebSocket 连接，这些诊断代码完全重复了 SDK 的工作。而且每次启动都创建一个额外的 WebSocket 连接只为了测试，测完即丢。

**依赖影响**：移除后可以删掉 `ws` 和 `dns/promises` 的 import（`ws` 包仅此处使用，Lark SDK 内部自带 WebSocket 支持）。

**建议**：直接删除这三个函数及相关调用。

---

## 问题 2：index.ts 存在双重日志系统（严重）

**文件**: `src/index.ts`
**涉及**: `dbg()` 函数 + `~/feishu-debug.log` 文件

插件同时维护两套日志：
1. `log()` — 通过 `client.app.log()` 输出到 OpenCode 日志系统
2. `dbg()` — 通过 `appendFileSync` 同步写入 `~/feishu-debug.log`

**问题**：
- 每个关键操作都调用两次日志（`dbg()` + `log()`）
- `appendFileSync` 是同步 I/O，阻塞事件循环
- `writeFileSync` 在每次初始化时清空文件，覆盖之前的诊断信息
- `dbg()` 没有级别区分，所有信息混在一起
- `console.log` 在 line 32 是第三套日志输出

**建议**：删除 `dbg()` 函数和 `~/feishu-debug.log` 相关代码，仅保留 `log()` 函数。

---

## 问题 3：log 函数的 console fallback（中等）

**文件**: `src/index.ts` 第 42-57 行

`log()` 函数在 `client.app.log()` 失败时 fallback 到 `console.log`/`console.error`。

**问题**：冗余的 fallback 设计。`client.app.log()` 是 OpenCode SDK 提供的标准接口，如果它失败说明运行环境有问题，不应静默降级。

**决策**：简化为 `.catch(() => {})`。必须保留 `.catch()` 防止 Unhandled Promise Rejection 导致进程崩溃（因为 `log()` 不 await），但移除 console fallback 逻辑。

---

## 问题 4：group-filter.ts 的 fallback 模式（中等）

**文件**: `src/feishu/group-filter.ts` 第 16 行

```typescript
if (!botOpenId) return mentions.length > 0;
```

当 bot open_id 获取失败时，fallback 为"任何 @提及都回复"。

**问题**：这导致群聊中 @任何人都会触发 bot 回复，是个隐形 bug。而且获取 bot open_id 的 `fetchBotOpenId` 函数本身也有 fallback（返回空字符串不报错）。

**决策**：严格模式 — `fetchBotOpenId` 失败时直接抛出错误，阻止插件启动。bot open_id 是群聊功能的必需信息，不应用 fallback 跳过。同时从 `group-filter.ts` 中移除 `mentions.length > 0` 的 fallback 分支。

---

## 问题 5：types.ts 中 proxy 字段是死代码（轻微）

**文件**: `src/types.ts` 第 24 行

`FeishuPluginConfig` 有 `proxy?: string` 字段，但：
- `ResolvedConfig` 不包含此字段
- 代码中从不读取此配置值
- 实际代理通过环境变量 `HTTPS_PROXY` 自动处理（`ProxyAgent` 已自动读取）

**建议**：从 `FeishuPluginConfig` 中删除 `proxy` 字段。

---

## 问题 6：sender.ts 和 event.ts 的死参数（轻微）

1. `src/feishu/sender.ts` 第 19 行：`_replyToId?: string` — 从未使用
2. `src/handler/event.ts` 第 33 行：`_feishuClient` 参数 — 从未使用（每个 `PendingReplyPayload` 自带 `feishuClient`）

**建议**：删除这两个未使用的参数。

---

## 问题 7：chat.ts 中的重复 "更新或发送" 模式（轻微）

**文件**: `src/handler/chat.ts` 第 119-127 行和第 133-141 行

同样的逻辑重复两次：
```typescript
if (placeholderId) {
  try { await sender.updateMessage(...) }
  catch { await sender.sendTextMessage(...) }
} else {
  await sender.sendTextMessage(...)
}
```

**决策**：提取为 helper 函数 `replyOrUpdate()`，保留 update → send fallback（必要容错）。

---

## 问题 8：dedup.ts 中的测试专用导出（轻微）

**文件**: `src/feishu/dedup.ts` 第 22-25 行

`clearDedup()` 标注为"测试用"，但项目约定不需要单测。

**建议**：删除 `clearDedup()` 导出。

---

## 问题 9：event.ts 中 session.error 的三层嵌套 try-catch（轻微）

**文件**: `src/handler/event.ts` 第 60-77 行

```typescript
try { updateMessage(...) }
catch {
  try { sendTextMessage(...) }
  catch { log("error", ...) }
}
```

三层嵌套的防御性编程，过度复杂。

**决策**：保留 update → send fallback（这是必要容错：占位消息可能已被 chat.ts 轮询清理），但移除第三层 try-catch（log 本身不会抛异常）。

---

## 问题 10：session.ts 中的双重排序 fallback（轻微）

**文件**: `src/session.ts` 第 33-41 行

从标题字符串中解析时间戳排序，解析失败再 fallback 到 `time.created`。标题中的时间戳和 `time.created` 本质上是同一个信息。

**建议**：直接使用 `time.created` 排序，删除标题解析逻辑。

---

## 问题 11：ws.d.ts 类型声明文件可能多余（待验证）

**文件**: `src/types/ws.d.ts`

如果移除问题 1 中的 `ws` 相关代码后，`ws` 包不再直接导入，此文件可以删除。

**建议**：随问题 1 一起清理。

---

## 变更影响汇总

| 问题 | 删除行数（约） | 风险 | 依赖变更 |
|------|:-----------:|:----:|----------|
| 1. WS 诊断代码 | ~130 | 低 | 可移除 `ws` 依赖 |
| 2. 双重日志 | ~15 | 低 | 无 |
| 3. log fallback | ~5 | 低 | 无 |
| 4. group-filter fallback | ~3 | 中 | 启动行为变更 |
| 5. proxy 死字段 | ~1 | 无 | 无 |
| 6. 死参数 | ~2 | 无 | 无 |
| 7. 重复模式 | +5/-15 | 低 | 无 |
| 8. clearDedup | ~4 | 无 | 无 |
| 9. 三层 try-catch | ~5 | 低 | 无 |
| 10. 双重排序 | ~5 | 低 | 无 |
| 11. ws.d.ts | ~4 | 无 | 无 |

预计净减少 **~170 行**代码。

## 成功标准

- **SC-001**: `npm run build` 和 `npm run typecheck` 通过
- **SC-002**: 无双重日志系统（仅 `client.app.log()` 一种日志输出）
- **SC-003**: 无未使用的参数、字段、导出
- **SC-004**: 无 fallback 逻辑（获取 bot open_id 失败直接报错）
- **SC-005**: 代码中无三层以上嵌套的 try-catch
- **SC-006**: `ws` 包不再是直接依赖（仅 Lark SDK 内部使用）
