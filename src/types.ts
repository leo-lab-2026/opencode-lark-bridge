export interface NotificationTarget {
  chat_id?: string
  user_id?: string
}

export interface NotificationMessage {
  text: string
  target: NotificationTarget
}

export interface Notifier {
  send(message: NotificationMessage): Promise<void>
}

export interface Logger {
  info(message: string, extra?: Record<string, unknown>): void
  debug(message: string, extra?: Record<string, unknown>): void
  error(message: string, extra?: Record<string, unknown>): void
}

export interface CategoryConfig {
  target?: NotificationTarget
  template?: string
  template_multiple?: string           // 多问题整体框架模板
  question_item_template?: string      // 多问题中每个问题项的模板
  retry_threshold?: number             // retry 类别：attempt 触发阈值，默认 1
  retry_interval_ms?: number           // retry 类别：重复提醒节流窗口，默认 900_000（15 分钟）
  notify_subagent?: boolean            // retry 类别：子代理重试是否通知，默认 false
  retry_detail?: boolean               // retry 类别：是否包含 attempt/next 详情，默认 true
}

export interface PluginConfig {
  app_id: string
  app_secret: string
  default_target: NotificationTarget
  debounce_ms: number
  log_file: string
  categories: Record<string, CategoryConfig>
}
