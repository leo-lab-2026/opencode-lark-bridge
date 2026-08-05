## 1. 类型与配置

- [x] 1.1 `src/types.ts`：`PluginConfig.categories` 新增 `retry` 配置类型（`target?`、`template?`、`retry_threshold?`、`retry_interval_ms?`、`notify_subagent?`、`retry_detail?`）
- [x] 1.2 `src/config.ts`：`loadConfig` 为 `categories.retry` 提供默认值（`retry_threshold: 1`、`retry_interval_ms: 900_000`、`notify_subagent: false`、`retry_detail: true`），`getEffectiveTarget` 覆盖 retry 类别回退 `default_target`
- [x] 1.3 更新示例配置 `opencode-lark-bridge.config.example.jsonc`：新增 `categories.retry` 注释化示例（含子代理开关与详情开关）

## 2. 事件处理

- [x] 2.1 新增 `src/events/retry-mapper.ts`：`mapRetryEvent` 从 `session.status` payload 提取 `message`/`attempt`/`next`/`sessionID`，渲染模板（占位符 `{projectName}` `{sessionTitle}` `{message}` `{attempt}` `{next}`），缺失字段降级，`next` 格式化为北京时区可读时间，`retry_detail=false` 时跳过详情字段
- [x] 2.2 `src/events/event-handler.ts`：新增 `session.status` 分支——`status.type !== "retry"` 直接返回；`attempt < retry_threshold` 跳过并记 debug 日志；新增 `lastRetrySent` Map 做节流（首次立即，超过 `retry_interval_ms` 再次提醒）；通过后调用 `mapRetryEvent` 发送
- [x] 2.3 `src/events/event-handler.ts`：子代理 retry 按 `notify_subagent` 开关决定是否通知（默认跳过），通知时按自身 sessionID 独立节流；不修改 `pendingChildren`；不写入 `erroredSessions`
- [x] 2.4 `src/index.ts`：`enhanceEvent` 对 `session.status` 注入 `sessionID`/`projectName`/`sessionTitle`（复用 `resolveSessionTitle` 与缓存）
- [x] 2.5 `src/events/error-mapper.ts`：修复字段提取——旧形状 `error.type`/`error.message` 优先，回退 opencode 实际形状 `error.name`/`error.data.message`；`error.data.statusCode` 可用时附加状态码

## 3. 测试

- [x] 3.1 新增 `tests/retry-mapper.test.ts`：字段提取、模板渲染、缺失字段降级、`next` 时间格式化、`retry_detail=false` 跳过详情字段
- [x] 3.2 `tests/event-handler.test.ts`：阈值未达/达到、节流窗口内跳过、超时再提醒、不同会话独立、非 retry 状态（busy/idle）不通知、子代理默认不通知/开关开启后通知且不清理 pendingChildren、retry 不污染 erroredSessions
- [x] 3.3 `tests/integration.test.ts`：429 重试事件 → 飞书通知的端到端链路（含节流）
- [x] 3.4 `tests/index.test.ts`：`enhanceEvent` 对 `session.status` 的字段注入；恢复场景（retry 后 idle 仍发 completion）
- [x] 3.5 `tests/error-mapper.test.ts`：新增 opencode 实际错误形状（`{name, data:{message}}`）提取用例；`tests/event-handler.test.ts` 补充实际形状的 error 用例

## 4. 文档与验证

- [x] 4.1 `README.md`：新增 retry 通知说明（配置项、默认行为、子代理开关、详情开关、与 error 通知的边界、fallback 机制关联说明）
- [x] 4.2 运行 `npm run build`（tsc strict 零错误）与 `bun test` 全绿
