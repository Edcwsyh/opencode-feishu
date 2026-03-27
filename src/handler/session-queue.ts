/**
 * 会话消息队列调度器：按 sessionKey FIFO 串行处理
 *
 * - P2P 和群聊统一使用 FIFO 队列，消息按顺序处理不互相中断
 * - Auto-prompt 阶段可被新入队消息打断
 * - 静默转发完全绕过队列
 */
import type { FeishuMessageContext } from "../types.js"
import { handleChat, runOneAutoPromptIteration, type ChatDeps, type AutoPromptContext } from "./chat.js"
import { buildSessionKey } from "../session.js"

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

const QUEUE_MONITOR_INTERVAL_MS = 200

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

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
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

  // P2P 和群聊统一使用 FIFO 队列：消息按顺序处理，不互相中断
  // auto-prompt 阶段仍可被新消息打断（drainLoop Phase 2）
  await handleGroupMessage(sessionKey, ctx, deps)
}

/**
 * FIFO 串行队列：P2P 和群聊统一使用
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
 * 串行消费队列中的所有消息，队列耗尽后进入空闲 auto-prompt 阶段
 */
async function drainLoop(sessionKey: string, state: QueueState): Promise<void> {
  state.processing = true
  let autoPromptCtx: AutoPromptContext | undefined
  let idleCount = 0
  let autoPromptIteration = 0

  try {
    while (true) {
      // Phase 1: 用户消息优先
      if (state.queue.length > 0) {
        const item = state.queue.shift()!
        const controller = new AbortController()
        state.controller = controller

        try {
          autoPromptCtx = await processMessage(item.ctx, item.deps, controller.signal)
          idleCount = 0
          autoPromptIteration = 0
        } catch (err) {
          item.deps.log("error", "群聊队列消息处理失败", {
            sessionKey,
            error: err instanceof Error ? err.message : String(err),
          })
        } finally {
          state.controller = null
        }
        continue
      }

      // Phase 2: 队列空，尝试空闲 auto-prompt
      if (!autoPromptCtx) break
      const { autoPrompt } = autoPromptCtx.deps.config
      if (!autoPrompt.enabled) break
      if (autoPromptIteration >= autoPrompt.maxIterations) {
        autoPromptCtx.deps.log("info", "自动提示循环结束（达到最大次数）", { sessionKey })
        break
      }

      // 可中断 sleep：拆成 1 秒粒度，每秒检查队列
      const intervalSeconds = autoPrompt.intervalSeconds
      let interrupted = false
      for (let s = 0; s < intervalSeconds; s++) {
        await sleep(1000)
        if (state.queue.length > 0) {
          interrupted = true
          break
        }
      }
      if (interrupted) continue

      // 执行一轮 auto-prompt（可被新入队消息打断）
      const autoPromptController = new AbortController()
      const monitor = setInterval(() => {
        if (state.queue.length > 0) autoPromptController.abort()
      }, QUEUE_MONITOR_INTERVAL_MS)
      try {
        const result = await runOneAutoPromptIteration(
          autoPromptCtx,
          autoPromptIteration + 1,
          autoPromptController.signal,
        )
        autoPromptIteration++

        if (result.isIdle) {
          idleCount++
          if (idleCount >= autoPrompt.idleThreshold) {
            autoPromptCtx.deps.log("info", "自动提示循环结束（检测到空闲）", {
              sessionKey, iteration: autoPromptIteration, idleCount,
            })
            break
          }
        } else {
          idleCount = 0
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          continue
        }
        autoPromptCtx.deps.log("error", "自动提示迭代异常", {
          sessionKey,
          error: err instanceof Error ? err.message : String(err),
        })
        break
      } finally {
        clearInterval(monitor)
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
  ctx: FeishuMessageContext, deps: ChatDeps, signal: AbortSignal,
): Promise<AutoPromptContext | undefined> {
  return handleChat(ctx, deps, signal)
}

export type { ChatDeps } from "./chat.js"
