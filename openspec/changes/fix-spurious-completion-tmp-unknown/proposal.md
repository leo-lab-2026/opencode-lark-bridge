## Why

`fix-completion-empty-project` 修复后，本地安装的插件在非项目目录（如 `/tmp`）下被 OpenCode 加载时，会反复发送 `Project: tmp / Session: unknown` 的任务完成通知。运行时日志证实：OpenCode 在插件加载时发射畸形 `session.idle` 事件（`sessionID` 无法解析 -> `"unknown"`，`properties` 内嵌 `type` 字段），插件将其当作真实会话完成发送通知；每次插件重新初始化内存去重表清空，导致重复发送。

## What Changes

- 在 `event-handler.ts` 的 `session.idle` 分支，当 `extractSessionID` 回退为 `"unknown"`（无法识别真实会话 ID）时，跳过完成通知。
- 新增回归测试覆盖：畸形事件（sessionID unknown / 缺失）不发通知；真实 sessionID 仍正常发送。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

无。本次为 bug 修复（过滤无效事件），不改变 spec 级别验收场景。`.openspec.yaml` 设置 `skip_specs: true`。

## Impact

- 代码：`src/events/event-handler.ts`（session.idle 分支增加 unknown 过滤）。
- 测试：`tests/event-handler.test.ts`（3 个回归用例）。
- 影响范围：仅 completion 通知的无效事件过滤；不影响真实会话完成、permission/question/error 路径。
- 无接口/配置/schema 变更，无破坏性改动。
