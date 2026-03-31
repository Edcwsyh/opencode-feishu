import { z } from "zod"

/**
 * 飞书消息上下文（网关提取后传递给处理器）
 */
export interface FeishuMessageContext {
  chatId: string
  messageId: string
  messageType: string
  /** 提取后的文本内容（text/post 类型），非文本类型可能为空 */
  content: string
  /** 原始 JSON content 字符串（用于资源下载和内容提取） */
  rawContent: string
  chatType: "p2p" | "group"
  senderId: string
  rootId?: string
  parentId?: string
  /** 消息创建时间（毫秒时间戳字符串，来自飞书 create_time 字段） */
  createTime?: string
  /** false = 静默监听：消息转发给 OpenCode 但不在飞书回复（群聊未被 @提及时） */
  shouldReply: boolean
}

const NudgeSchema = z.object({
  enabled: z.boolean().default(false),
  message: z.string().min(1).default("上一步操作已完成。请继续执行下一步，同步当前进度。如果全部完成，给出完整结果和结论。"),
  intervalSeconds: z.number().int().positive().max(300).default(30),
  maxIterations: z.number().int().positive().max(100).default(3),
})

export const FeishuConfigSchema = z.object({
  appId: z.string().min(1, "appId 不能为空"),
  appSecret: z.string().min(1, "appSecret 不能为空"),
  timeout: z.number().int().positive().optional(),
  thinkingDelay: z.number().int().nonnegative().default(2_500),
  logLevel: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  maxHistoryMessages: z.number().int().positive().max(500).default(200),
  pollInterval: z.number().int().positive().default(1_000),
  stablePolls: z.number().int().positive().default(3),
  dedupTtl: z.number().int().positive().default(10 * 60 * 1_000),
  maxResourceSize: z.number().int().positive().max(500 * 1024 * 1024).default(500 * 1024 * 1024),
  nudge: NudgeSchema.default(() => NudgeSchema.parse({})),
  directory: z.string().optional(),
})

/**
 * feishu.json 输入类型（所有字段可选，Zod 填充默认值）
 * 用于文档和外部类型引用，自动与 schema 同步
 */
export type FeishuPluginConfig = z.input<typeof FeishuConfigSchema>

/**
 * 合并默认值后的完整配置（由 FeishuConfigSchema 推导）
 */
export type ResolvedConfig = z.infer<typeof FeishuConfigSchema> & { directory: string }

/**
 * 插件日志函数签名
 */
export type LogFn = (
  level: "info" | "warn" | "error",
  message: string,
  extra?: Record<string, unknown>,
) => void

export interface PermissionRequest {
  id?: string | number
  permission?: string
  patterns?: string[]
}

export interface QuestionRequest {
  id?: string | number
  questions?: Array<{
    question?: string
    header?: string
    options?: Array<{ label?: string; value?: string }>
  }>
}
