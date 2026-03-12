/**
 * 会话消息队列调度器：按 sessionKey 控制并发，防止占位消息覆盖
 *
 * - P2P（单聊）：可中断策略 — 新消息中断当前处理
 * - Group（群聊）：串行队列 — FIFO 顺序依次处理
 * - 静默转发：完全绕过队列
 */
import type { FeishuMessageContext } from "../types.js"
import { handleChat, type ChatDeps } from "./chat.js"
import { buildSessionKey, getCachedSession } from "../session.js"

interface QueuedMessage {
  readonly ctx: FeishuMessageContext
  readonly deps: ChatDeps
}

interface QueueState {
  controller: AbortController | null
  currentTask: Promise<void> | null
  queue: QueuedMessage[]
  processing: boolean
}

/** 全局队列状态：sessionKey → QueueState */
const states = new Map<string, QueueState>()

function getOrCreateState(sessionKey: string): QueueState {
  const existing = states.get(sessionKey)
  if (existing) return existing
  const state: QueueState = {
    controller: null,
    currentTask: null,
    queue: [],
    processing: false,
  }
  states.set(sessionKey, state)
  return state
}

function cleanupStateIfIdle(sessionKey: string, state: QueueState): void {
  if (!state.processing && state.queue.length === 0) {
    states.delete(sessionKey)
  }
}

/**
 * 消息入队：统一入口，根据 shouldReply 和 chatType 分发策略
 */
export async function enqueueMessage(ctx: FeishuMessageContext, deps: ChatDeps): Promise<void> {
  // 静默消息完全绕过队列
  if (!ctx.shouldReply) {
    await handleChat(ctx, deps)
    return
  }

  const sessionKey = buildSessionKey(
    ctx.chatType,
    ctx.chatType === "p2p" ? ctx.senderId : ctx.chatId,
  )

  if (ctx.chatType === "p2p") {
    await handleP2PMessage(sessionKey, ctx, deps)
  } else {
    await handleGroupMessage(sessionKey, ctx, deps)
  }
}

/**
 * P2P 可中断策略：中断当前处理，立即处理新消息。
 * 使用 while 循环确保 burst 场景下（多条消息几乎同时到达）只有最后一条获得处理槽。
 */
async function handleP2PMessage(
  sessionKey: string,
  ctx: FeishuMessageContext,
  deps: ChatDeps,
): Promise<void> {
  const state = getOrCreateState(sessionKey)

  // 持续中断直到获得空闲槽位（防止 burst 场景下多个 caller 同时通过）
  while (state.processing) {
    if (state.controller) {
      state.controller.abort()
      await abortServerSession(sessionKey, deps)
    }
    if (state.currentTask) {
      await state.currentTask.catch(() => {})
    }
  }

  // 此时 processing=false，安全地独占槽位
  const controller = new AbortController()
  state.controller = controller
  state.processing = true

  const task = processMessage(ctx, deps, controller.signal)
    .finally(() => {
      state.processing = false
      state.controller = null
      state.currentTask = null
      cleanupStateIfIdle(sessionKey, state)
    })

  state.currentTask = task
  await task
}

/**
 * 群聊串行队列策略：FIFO 顺序依次处理
 */
async function handleGroupMessage(
  sessionKey: string,
  ctx: FeishuMessageContext,
  deps: ChatDeps,
): Promise<void> {
  const state = getOrCreateState(sessionKey)
  state.queue.push({ ctx, deps })

  // 已有 drainLoop 运行中，消息已入队，等它处理
  if (state.processing) return

  await drainLoop(sessionKey, state)
}

/**
 * 串行消费队列中的所有消息
 */
async function drainLoop(sessionKey: string, state: QueueState): Promise<void> {
  state.processing = true

  try {
    while (state.queue.length > 0) {
      const item = state.queue.shift()
      if (!item) break

      const controller = new AbortController()
      state.controller = controller

      try {
        await processMessage(item.ctx, item.deps, controller.signal)
      } catch (err) {
        item.deps.log("error", "群聊队列消息处理失败", {
          sessionKey,
          error: err instanceof Error ? err.message : String(err),
        })
      } finally {
        state.controller = null
      }
    }
  } finally {
    state.processing = false
    cleanupStateIfIdle(sessionKey, state)
  }
}

/**
 * 处理单条消息，将 signal 传递给 handleChat
 */
async function processMessage(
  ctx: FeishuMessageContext,
  deps: ChatDeps,
  signal: AbortSignal,
): Promise<void> {
  await handleChat(ctx, deps, signal)
}

/**
 * 向服务端发送 abort 请求，中断正在进行的 AI 推理。
 * 仅在缓存中存在 session 时发送（避免创建 ghost session）。
 */
async function abortServerSession(
  sessionKey: string,
  deps: ChatDeps,
): Promise<void> {
  const { client, log, directory } = deps
  const query = directory ? { directory } : undefined

  const cached = getCachedSession(sessionKey)
  if (!cached) return

  try {
    await client.session.abort({ path: { id: cached.id }, query })
    log("info", "已中断当前会话处理", { sessionKey, sessionId: cached.id })
  } catch (err) {
    log("warn", "中断会话失败", {
      sessionKey,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

export type { ChatDeps } from "./chat.js"
