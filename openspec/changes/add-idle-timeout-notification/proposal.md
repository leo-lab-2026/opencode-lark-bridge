## Why

覆盖矩阵检验发现：除了 429 无限重试（由 `add-retry-notification` 负责），还存在第二类静默停滞——模型挂起、SSE 超时、网络黑洞等场景下，会话持续处于 `busy` 状态但**不产生任何事件**（无 `message.part.delta`、无工具调用、无 retry 信号）。opencode 事件流是异步推送制，busy 状态无周期性心跳事件，插件仅靠事件驱动无法感知"什么都没有发生"。此类停滞同样让 opencode 停止工作流程，用户却收不到任何飞书通知。

## What Changes

- 插件新增**会话活动追踪**：通过 `session.created` / `session.idle` / `session.error` / `session.status` / 消息/工具/权限/问题等事件维护每个会话的"最后活动时间"
- 新增**内存定时器**（`setInterval`，随 opencode 进程生命周期）：周期性扫描活跃会话，发现"处于工作状态但超过 `stall_timeout_ms`（默认 10 分钟）无任何活动事件"的会话，发送飞书提醒
- 新增 `categories.stall` 配置项：独立 target、模板、超时阈值、检查间隔；沿用 `getEffectiveTarget` 回退 `default_target`
- 新增 `stall-mapper`：渲染"会话长时间无进展"通知（含 `projectName`/`sessionTitle`/无进展时长）
- 与 `retry` 通知的分工：retry 期间有事件流（`session.status` 持续发布），活动时间持续更新，不会误触发 stall；stall 仅覆盖完全静默的 busy 挂起
- 会话结束（`session.idle`/`session.error`）后停止追踪；不把停滞会话标记为 errored，恢复后 completion 正常发送

## Capabilities

### New Capabilities
- `stall-notification`: 监听会话活动时间，对长时间无进展的活跃会话发送超时提醒

### Modified Capabilities
- `error-notification`: 无 spec 级行为变更
- `retry-notification`: 无 spec 级行为变更（stall 与 retry 分工由各自 change 的 spec 与设计定义，互不重叠）

## Impact

- `src/events/event-handler.ts`：新增会话活动追踪（各事件分支更新 `lastActive`）；新增 stall 扫描逻辑与定时器生命周期管理
- 新增 `src/events/stall-mapper.ts`：stall 事件 → 通知消息映射
- `src/types.ts`：`PluginConfig.categories` 新增 `stall` 配置类型
- `src/config.ts`：`categories.stall` 默认值（`stall_timeout_ms: 600_000`、`check_interval_ms: 60_000`）与校验
- `src/index.ts`：定时器创建/销毁；`session.created` 事件注入增强
- 示例配置 `opencode-lark-bridge.config.example.jsonc`、README 文档
- 测试：`tests/event-handler.test.ts`（活动追踪/扫描触发）、`tests/stall-mapper.test.ts`、`tests/integration.test.ts`、`tests/index.test.ts`
- 不涉及：notifier 发送层、opencode 重试行为、进程外 watchdog（opencode 进程崩溃时插件随进程消亡，无法自通知）
