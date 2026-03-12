/**
 * 飞书卡片 Markdown 清理工具
 */

const MAX_CARD_BYTES = 28 * 1024 // 留 2KB 余量（飞书上限 ~30KB）

/**
 * 清理 markdown 使其兼容飞书卡片渲染
 * - 移除 HTML 标签
 * - 确保代码块正确闭合
 */
export function cleanMarkdown(text: string): string {
  // <br> → 换行
  let result = text.replace(/<br\s*\/?>/gi, "\n")
  // 移除其他 HTML 标签
  result = result.replace(/<[^>]+>/g, "")
  // 确保代码块闭合
  result = closeCodeBlocks(result)
  return result
}

/**
 * 截断超长内容，确保不超过飞书卡片大小限制
 */
export function truncateMarkdown(text: string, limit = MAX_CARD_BYTES): string {
  const bytes = new TextEncoder().encode(text)
  if (bytes.length <= limit) return text
  // 按字节截断，确保不截断 UTF-8 多字节字符
  const truncated = new TextDecoder().decode(bytes.slice(0, limit))
  // 找最后一个完整行
  const lastNewline = truncated.lastIndexOf("\n")
  const cutPoint = lastNewline > limit * 0.8 ? lastNewline : truncated.length
  let result = truncated.slice(0, cutPoint)
  result = closeCodeBlocks(result)
  return result + "\n\n*内容过长，已截断*"
}

function closeCodeBlocks(text: string): string {
  const matches = text.match(/```/g)
  if (matches && matches.length % 2 !== 0) {
    return text + "\n```"
  }
  return text
}
