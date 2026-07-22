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
}

export interface PluginConfig {
  app_id: string
  app_secret: string
  default_target: NotificationTarget
  debounce_ms: number
  log_file: string
  categories: Record<string, CategoryConfig>
}
