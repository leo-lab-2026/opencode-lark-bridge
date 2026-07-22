import type { Logger, Notifier, NotificationMessage } from "../types"

export type ShellExecutor = (command: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>

function escapeShellArg(arg: string): string {
  return `"${arg.replace(/"/g, '\\"')}"`
}

export function createLarkNotifier(logger: Logger, execute: ShellExecutor): Notifier {
  return {
    async send(message: NotificationMessage) {
      try {
        const targetArg = message.target.chat_id
          ? `--chat-id ${message.target.chat_id}`
          : `--user-id ${message.target.user_id}`
        const command = `lark-cli im +messages-send ${targetArg} --as bot --text ${escapeShellArg(message.text)}`
        logger.debug("Executing lark-cli command", { command })
        const result = await execute(command)
        if (result.exitCode !== 0) {
          logger.error("lark-cli failed", { stderr: result.stderr, exitCode: result.exitCode })
        }
      } catch (err) {
        logger.error(`Failed to send Lark notification: ${(err as Error).message}`)
      }
    }
  }
}
