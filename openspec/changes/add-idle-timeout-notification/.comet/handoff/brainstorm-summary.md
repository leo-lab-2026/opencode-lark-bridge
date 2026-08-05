# Brainstorm Summary

- Change: add-idle-timeout-notification
- Date: 2026-08-05

## 确认的技术方案

方案 A：handler 统一入口 touch + 导出扫描函数

- `createEventHandler` 内新增 `lastActive`/`stallLastSent`/`stallMeta` 三张表；`handle()` 入口统一提取 sessionID 并 `touchActivity`（任何事件类型都更新，覆盖 spec 要求的 message/tool/permission/question/retry/status 等）
- `session.created` 加入追踪并缓存 title；`session.idle`/`session.error`/`session.deleted` 移除追踪并清理条目
- 返回 `scanStalledSessions()`：超时判定（`stall_timeout_ms`，默认 600_000）+ 节流（`stall_interval_ms`，默认 3_600_000）+ 跳过子代理；渲染 `mapStallEvent` 发送
- 定时器由 index.ts 创建（`setInterval`，间隔 `stall_check_interval_ms` 默认 60_000），handler 保持纯逻辑、测试直接调用 `scanStalledSessions`
- **子代理级联 touch**：子代理事件更新自身的同时沿 `subagentParentMap` 链更新父会话活动时间，避免"子代理长任务期间父会话误报 stall"
- 配置默认值分支内兜底（`?? 600_000` 等），loadConfig 不改，与 retry-notification 先例一致

## 关键取舍与风险

- 子代理不单独提醒 stall（父会话超时已覆盖"子代理卡住"场景），避免双通知；级联 touch 防止子代理活跃时父会话误报
- 误报风险：模型单次长推理无 delta 也可能触发；10 分钟默认阈值 + 60 分钟节流，可配置
- 定时器随 opencode 进程生命周期；进程崩溃无法自通知（能力边界，文档明示）
- `lastActive` 内存增长由 idle/error/deleted 清理收敛

## 测试策略

- `tests/stall-mapper.test.ts`（新）：模板渲染、`idleDuration` 格式化、缺失字段降级
- `tests/event-handler.test.ts`：活动追踪（created/事件更新/idle 清理）、`scanStalledSessions` 超时触发、未超时跳过、节流窗口内不重复、恢复活动重置、retry 事件流不触发 stall、子代理级联 touch、子代理不单独提醒、stall 不污染 erroredSessions
- `tests/integration.test.ts`：静默会话超时 → 飞书通知端到端
- `tests/index.test.ts`：定时器按 `stall_check_interval_ms` 创建

## Spec Patch

无（delta spec 已含"会话上下文缺失降级""重试期间不触发 stall"等场景）

## 补充确认（2026-08-05 定稿）

- 用户确认方案 A + 级联 touch + 分支内兜底 + 子代理不单独提醒
- `idleDuration` 格式：`<60s` → "N 秒"；`<1h` → "X 分钟 Y 秒"；`≥1h` → "X 小时 Y 分钟"
- Design Doc: `docs/superpowers/specs/2026-08-05-idle-timeout-notification-design.md`
