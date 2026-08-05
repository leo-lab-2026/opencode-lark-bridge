## Why

当模型 API 返回 429（如 "credits quota exhausted"）时，opencode 将其视为可重试错误并**无限重试**（`session/retry.ts` 的 `Schedule.fromStepWithMetadata` 无放弃路径）。重试期间不产生插件监听的任何事件（`permission.asked` / `session.idle` / `question.asked` / `session.error` 全部静默），唯一的事件信号是 `session.status`（`status.type === "retry"`，携带 `attempt`/`message`/`next`）。因此用户在 429 无限重试期间完全收不到飞书通知，只能盯终端看到 "retrying in 3s attempt #3"。现有 `error-notification` spec 假设"429 会导致 `session.error`"，与 opencode 实际行为不符。

## What Changes

- 插件新增监听 `session.status` 事件中 `status.type === "retry"` 的状态，将其视为"重试进行中"信号
- 新增 `categories.retry` 配置项（与 permission/completion/question/error 并列）：独立 target、模板、attempt 触发阈值、重复提醒间隔、子代理开关、内容详略开关
- 通知触发采用**配置化阈值**：`attempt >= retry_threshold`（默认 1，即首次重试即通知）
- 重复提醒采用**首次 + 定期提醒**：重试持续期间每间隔 `retry_interval_ms`（默认 15 分钟）再次提醒，防止无限重试期间完全静默
- **通知内容可配置化**：`retry_detail` 开关控制是否包含 `attempt`/`next`（下次重试时间）等细节字段，默认包含
- **子代理默认不通知**：`notify_subagent` 开关（默认 false）控制子代理会话的 retry 是否通知，与 completion 的子代理策略一致
- 新增 `retry-mapper`：从事件提取 `message`（如 "Provider is overloaded" / "credits quota exhausted"）、`attempt`、`next`（下次重试时间），与现有 `projectName`/`sessionTitle` 增强一致
- **修复 error 通知字段提取**：`error-mapper` 改为按 opencode 真实错误对象形状（`{ name, data: { message } }`）提取 `errorType`/`errorMessage`，兼容旧形状 `{ type, message }`，并支持 `statusCode`/`isRetryable` 字段（含在 `data` 中）
- 重试通知不影响现有 completion 逻辑：429 恢复后的 `session.idle` 仍正常发送 completion 通知（不把会话标记为 errored）
- **fallback 机制关联**：opencode 社区 fallback 方案（如 omo/oms）会在 429 时自动切换备选模型，从而**避免**无限重试；本功能是通知层兜底——无论是否配置 fallback，重试进行中用户都应知晓。二者互补：fallback 负责"让工作继续"，通知负责"让用户知情"。本 change 不实现 fallback（属用户侧 opencode 配置）

## Capabilities

### New Capabilities
- `retry-notification`: 监听 `session.status` 的 retry 状态，按配置阈值与节流策略向飞书发送重试通知

### Modified Capabilities
- `error-notification`: 需求修改——修复错误字段提取。opencode 错误对象真实形状为 `{ name, data: { message, statusCode, isRetryable } }`（schema `namedError`），现有 error-mapper 提取 `error.type`/`error.message` 导致生产环境 Type/Message 永远为 "unknown"；修改提取逻辑（`error.name` + `error.data.message`，兼容旧形状）。另补充说明：429/限流错误在 opencode 中走重试路径（不触发 `session.error`），其"重试中"阶段由新增 `retry-notification` 覆盖；`session.error` 仅在重试放弃或不可重试错误时触发，错误通知行为不变

## Impact

- `src/events/event-handler.ts`：新增 `session.status` 分支（retry 状态路由 + 阈值判断 + 节流状态 + 子代理开关）
- 新增 `src/events/retry-mapper.ts`：retry 事件 → 通知消息映射（含内容详略开关）
- `src/events/error-mapper.ts`：修复字段提取（`error.name`/`error.data.message`，兼容旧形状）
- `src/types.ts`：`PluginConfig.categories` 新增 `retry` 配置类型
- `src/config.ts`：`categories.retry` 默认值与校验
- `src/index.ts`：`session.status` 事件增强（注入 `projectName`/`sessionTitle`）
- 示例配置 `opencode-lark-bridge.config.example.jsonc`、README 文档
- 测试：`tests/event-handler.test.ts`、`tests/retry-mapper.test.ts`、`tests/integration.test.ts`、`tests/index.test.ts`
- 不涉及：notifier 发送层（复用 lark-notifier）、opencode 重试行为本身、模型 fallback 能力（仅文档说明关联）
- 静默停滞的另一缺口（busy 挂起无事件）由独立 change `add-idle-timeout-notification` 负责，不在本 change 范围
