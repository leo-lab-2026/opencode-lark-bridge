# Brainstorm Summary

- Change: fix-stall-finished-session-bypass
- Date: 2026-08-07

## 确认的技术方案

采用 Allowlist 方案替换 Blocklist：
- 新增 `isActivityEvent(event)` 函数，仅对 `permission.asked`、`question.asked`、`session.status`（`status.type === "busy"`）返回 true
- 入口逻辑：已完成会话仅当 `isActivityEvent` 返回 true 时才 `finishedSessions.delete` + `touchActivity`；否则不修改防护、不更新活动时间
- 删除 `isLifecycleEvent` 函数
- 移除临时调试日志

## 关键取舍与风险

- **Allowlist 可能过于严格**：选择保守策略（宁漏激活不误激活），因为误激活是当前 bug 的直接表现
- **`session.status busy` 在 idle 后到达**：正确行为（新任务开始），即使立即再次 idle 也有 debounce 保护
- **`session.idle` hook 是死代码**：opencode 1.18.11 不调用此 hook，仅 `event` hook 接收 `session.idle` 事件；保留不删除（向前兼容）
- **`permission.updated` 不在 allowlist 中**：权限变更是系统响应，不代表用户主动恢复；恢复信号由 `session.status busy` 覆盖

## 测试策略

1. **单元测试 `isActivityEvent`**：验证对每种事件类型的返回值
2. **入口逻辑集成测试**：
   - 活跃会话 + 任意事件 -> touchActivity 调用
   - 已完成会话 + `session.updated` -> 不 touch、不删除防护
   - 已完成会话 + `permission.asked` -> touch + 删除防护
   - 已完成会话 + `question.asked` -> touch + 删除防护
   - 已完成会话 + `session.status` busy -> touch + 删除防护
   - 已完成会话 + 未知事件类型 -> 不 touch、不删除防护
3. **回归测试**：运行现有全部测试确保无回归

## Spec Patch

无（delta spec 已在 open 阶段完整定义）
