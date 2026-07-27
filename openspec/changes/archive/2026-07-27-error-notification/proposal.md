## Why

opencode-lark-bridge 当前只在权限申请、任务完成和问答事件时推送飞书通知，但当模型 API 错误（400/429/500）、额度耗尽、上下文溢出等致命错误导致 OpenCode 停止运行时，用户离开后无法及时知晓。OpenCode 的 `session.error` 事件已覆盖这类导致会话停止的错误（源码 `session/processor.ts` 中 `provider-error` → `halt()` → `Bus.publish(Session.Event.Error, …)` → `status idle`），但插件尚未监听该事件。需要新增错误通知能力，让用户在离开终端时也能收到飞书告警。

## What Changes

- 新增 `session.error` 事件处理分支，当 OpenCode 发布该事件时构造并发送飞书通知
- 新增 `src/events/error-mapper.ts`，从 `session.error` 事件 payload（`{ sessionID?: string, error: { type: string, message: string } }`）提取错误类型和消息，渲染通知模板
- 新增配置 category `"error"`，支持自定义 `target` 与 `template`；未配置时回退到 `default_target`
- 子代理（subagent）的 `session.error` 也推送通知（与 completion 跳过子代理的模式不同——错误可能阻塞父会话，用户需及时知晓）
- 复用 `debounce_ms` 机制对同一 sessionID 的重复错误去重
- 更新插件 hook 注册说明与示例配置模板，加入 error category

## Capabilities

### New Capabilities

- `error-notification`: 监听 OpenCode `session.error` 事件，在致命错误（模型 API 错误、额度耗尽、上下文溢出等）导致会话停止时，通过飞书通知用户。含错误信息提取、模板渲染、去重和子代理错误处理。

### Modified Capabilities

（无现有 specs 需要修改）

## Impact

- **新增文件**：`src/events/error-mapper.ts`、`tests/error-mapper.test.ts`、`tests/event-handler.test.ts` 错误分支用例
- **修改文件**：`src/events/event-handler.ts`（新增 session.error 路由分支）、`src/index.ts`（hook 注册日志更新）、`opencode-lark-bridge.config.example.jsonc`（新增 error category 示例）
- **复用**：`Notifier` 接口与 `lark-notifier` 不变；`getEffectiveTarget`、`debounce_ms` 去重逻辑、`sessionTitles` 缓存机制均复用
- **SDK 依赖**：`session.error` 事件由 OpenCode `@opencode-ai/plugin` v1.17.7+ 的 `event` hook 透传，无额外依赖