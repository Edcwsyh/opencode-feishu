/**
 * 对话处理：会话管理、占位消息、prompt 发送、轮询等待、最终回复
 */
import type { FeishuMessageContext, ResolvedConfig, LogFn } from "../types.js"
import type { OpencodeClient } from "@opencode-ai/sdk"
import * as sender from "../feishu/sender.js"
import { registerPending, unregisterPending } from "./event.js"
import { buildSessionKey, getOrCreateSession } from "../session.js"
import type * as Lark from "@larksuiteoapi/node-sdk"


export interface ChatDeps {
  config: ResolvedConfig
  client: OpencodeClient
  feishuClient: InstanceType<typeof Lark.Client>
  log: LogFn
  directory: string
}

export async function handleChat(ctx: FeishuMessageContext, deps: ChatDeps): Promise<void> {
  const { content, chatId, chatType, senderId, createTime, shouldReply } = ctx
  if (!content.trim()) return

  const { config, client, feishuClient, log, directory } = deps
  const query = directory ? { directory } : undefined

  const sessionKey = buildSessionKey(chatType, chatType === "p2p" ? senderId : chatId)
  const session = await getOrCreateSession(client, sessionKey, directory)

  // 构建带时间戳和发送者信息的 prompt
  const timeStr = createTime
    ? new Date(Number(createTime)).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
    : ""
  let promptContent = content
  if (chatType === "group" && senderId) {
    promptContent = timeStr
      ? `[${timeStr}] [${senderId}]: ${content}`
      : `[${senderId}]: ${content}`
  } else if (timeStr) {
    promptContent = `[${timeStr}] ${content}`
  }

  // 静默监听模式：消息发给 OpenCode 作为上下文，不触发 AI 回复
  if (!shouldReply) {
    try {
      await client.session.prompt({
        path: { id: session.id },
        query,
        body: {
          parts: [{ type: "text", text: promptContent }],
          noReply: true,
        },
      })
    } catch (err) {
      log("warn", "静默转发失败", {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

  const timeout = config.timeout
  const thinkingDelay = config.thinkingDelay
  const pollInterval = config.pollInterval
  const stablePolls = config.stablePolls

  let placeholderId = ""
  let done = false
  const timer =
    thinkingDelay > 0
      ? setTimeout(async () => {
          if (done) return
          try {
            const res = await sender.sendTextMessage(feishuClient, chatId, "正在思考…")
            if (res.ok && res.messageId) {
              placeholderId = res.messageId
              // 注册到事件系统（用于 SSE 流式更新占位消息）
              registerPending(session.id, { chatId, placeholderId, feishuClient })
            }
          } catch {
            // ignore
          }
        }, thinkingDelay)
      : null

  try {
    await client.session.prompt({
      path: { id: session.id },
      query,
      body: {
        parts: [{ type: "text", text: promptContent }],
      },
    })

    const start = Date.now()
    let lastText = ""
    let sameCount = 0

    while (Date.now() - start < timeout) {
      await new Promise((r) => setTimeout(r, pollInterval))
      const { data: messages } = await client.session.messages({ path: { id: session.id }, query })
      const text = extractLastAssistantText(messages ?? [])

      if (text && text !== lastText) {
        lastText = text
        sameCount = 0
        if (placeholderId) {
          try {
            await sender.updateMessage(feishuClient, placeholderId, text)
          } catch {
            // best-effort
          }
        }
      } else if (text && text.length > 0) {
        sameCount++
        if (sameCount >= stablePolls) break
      }
    }

    const { data: finalMessages } = await client.session.messages({ path: { id: session.id }, query })
    const finalText =
      extractLastAssistantText(finalMessages ?? []) ||
      lastText ||
      (Date.now() - start >= timeout ? "⚠️ 响应超时" : "[无回复]")

    await replyOrUpdate(feishuClient, chatId, placeholderId, finalText)
  } catch (err) {
    log("error", "对话处理失败", {
      error: err instanceof Error ? err.message : String(err),
    })
    const msg = "❌ " + (err instanceof Error ? err.message : String(err))
    await replyOrUpdate(feishuClient, chatId, placeholderId, msg)
  } finally {
    done = true
    if (timer) clearTimeout(timer)
    unregisterPending(session.id)
  }
}

async function replyOrUpdate(
  feishuClient: InstanceType<typeof Lark.Client>,
  chatId: string,
  placeholderId: string,
  text: string,
): Promise<void> {
  if (placeholderId) {
    try {
      await sender.updateMessage(feishuClient, placeholderId, text)
    } catch {
      await sender.sendTextMessage(feishuClient, chatId, text)
    }
  } else {
    await sender.sendTextMessage(feishuClient, chatId, text)
  }
}

function extractLastAssistantText(
  messages: Array<{
    info: { role?: string; [key: string]: unknown }
    parts: Array<{ type?: string; text?: string; [key: string]: unknown }>
  }>,
): string {
  const assistant = messages.filter((m) => m.info?.role === "assistant").pop()
  const parts = assistant?.parts ?? []
  return parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("\n")
    .trim()
}
