# Brainstorm Summary

- Change: add-retry-notification
- Date: 2026-08-05

## 确认的技术方案（待用户最终确认）

**D1 事件路由**：`event-handler.ts` 新增 `session.status` 分支——`status.type !== "retry"` 直接返回；`attempt < retry_threshold`（默认 1）跳过；子代理在 `notify_subagent !== true` 时跳过；`lastRetrySent` Map（key `retry:${sessionID}`）做节流（首次立即，超过 `retry_interval_ms` 默认 900_000 再次提醒）；通过后调用 `mapRetryEvent` 发送。

**D2 配置**：`CategoryConfig` 增加 4 个可选字段（`retry_threshold`/`retry_interval_ms`/`notify_subagent`/`retry_detail`），retry 分支读取时兜底默认值（不预先填充 categories）；`getEffectiveTarget(config, "retry")` 回退 default_target。默认值：阈值 1、间隔 900_000ms、notify_subagent false、retry_detail true。

**D3 mapper**：新增 `retry-mapper.ts`——`mapRetryEvent(event, target, template?, detail?)`，提取 `status.message`/`status.attempt`/`status.next`，占位符 `{projectName}` `{sessionTitle}` `{message}` `{attempt}` `{next}`；`next` 用 Intl.DateTimeFormat（Asia/Shanghai，`MM-DD HH:mm`）格式化；`detail=false` 时 `{attempt}`/`{next}` 渲染为空。

**D4 enhanceEvent**：`session.status` 分支注入 `sessionID`/`projectName`/`sessionTitle`（复用 `resolveSessionTitle` 与缓存）。

**D5 error-mapper 修复**：提取优先级 `error.type`/`error.message`（旧形状）→ `error.name`/`error.data.message`（opencode 实际形状）；`error.data.statusCode` 存在时类型显示为 `name (statusCode)`；均缺失降级 "unknown"。

**D6 不变量**：retry 分支不写 `erroredSessions`、不动 `pendingChildren`；429 恢复后的 `session.idle` 正常发 completion。

## 关键取舍与风险

- 节流用事件驱动检查（无定时器）：重试指数退避 2-30s 持续产生事件，检查频率足够
- `lastRetrySent` 内存增长：每会话一个时间戳条目，与现有 `lastSent` 同模式，可接受
- `attempt`/`next` 防御性处理（非 number 时降级），避免 opencode 版本演进破坏
- 默认开启 + 首次即通知可能对瞬时 429 误报：默认 15 分钟节流缓解，可配置

## 测试策略

- `tests/retry-mapper.test.ts`：提取/模板/detail=false/缺失降级/next 格式化（固定时间戳）
- `tests/event-handler.test.ts`：阈值、节流窗口、子代理开关、busy/idle 不通知、retry→idle 后 completion 正常、不污染 erroredSessions
- `tests/integration.test.ts`：retry 事件 → notifier 端到端
- `tests/index.test.ts`：enhanceEvent 注入
- `tests/error-mapper.test.ts`：新形状提取、旧形状优先、statusCode 附加

## Spec Patch

- 候选 1：retry-notification spec 补充边界场景"status 字段缺失/异常时安全跳过"
- 候选 2：error-notification delta spec 的场景补充 statusCode 附加显示
- 均待用户确认后回写
