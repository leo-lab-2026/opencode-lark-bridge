## 1. 类型与配置

- [x] 1.1 `src/types.ts`：`PluginConfig.categories` 新增 `stall` 配置类型（`target?`、`template?`、`stall_timeout_ms?`、`stall_interval_ms?`、`stall_check_interval_ms?`）
- [x] 1.2 `src/config.ts`：stall 三个默认值采用分支内兜底（`stall_timeout_ms: 600_000`、`stall_interval_ms: 3_600_000`、`stall_check_interval_ms: 60_000`，`loadConfig` 不改，与 retry 先例一致）；`getEffectiveTarget` 覆盖 stall 类别回退 `default_target`（现有通用逻辑，测试固化）
- [x] 1.3 更新示例配置 `opencode-lark-bridge.config.example.jsonc`：新增 `categories.stall` 注释化示例

## 2. 事件处理

- [ ] 2.1 新增 `src/events/stall-mapper.ts`：`mapStallEvent` 渲染模板（占位符 `{projectName}` `{sessionTitle}` `{idleDuration}`），`idleDuration` 格式化为可读时长
- [ ] 2.2 `src/events/event-handler.ts`：新增 `lastActive`/`stallLastSent` 追踪表；`session.created` 加入追踪，`session.idle`/`session.error`/`session.deleted` 移除追踪；活动事件（message/tool/permission/question/session.status）更新 `touchActivity`
- [ ] 2.3 `src/events/event-handler.ts`：新增 `scanStalledSessions()`——超时判定（`stall_timeout_ms`）+ 重复提醒节流（`stall_interval_ms`），调用 `mapStallEvent` 发送，失败仅记日志；不写入 `erroredSessions`
- [ ] 2.4 `src/index.ts`：初始化 `setInterval` 调用 `scanStalledSessions()`（间隔 `stall_check_interval_ms`），定时器句柄随进程生命周期

## 3. 测试

- [ ] 3.1 新增 `tests/stall-mapper.test.ts`：模板渲染、`idleDuration` 格式化、缺失字段降级
- [ ] 3.2 `tests/event-handler.test.ts`：活动追踪（created/事件更新/idle 清理）、`scanStalledSessions` 超时触发、未超时跳过、节流窗口内不重复、恢复活动重置、retry 事件流不触发 stall、stall 不污染 erroredSessions
- [ ] 3.3 `tests/integration.test.ts`：静默会话超时 → 飞书通知端到端链路
- [ ] 3.4 `tests/index.test.ts`：定时器按 `stall_check_interval_ms` 创建（间隔注入可测）

## 4. 文档与验证

- [ ] 4.1 `README.md`：新增 stall 通知说明（配置项、默认行为、与 retry 通知分工、进程崩溃属能力边界）
- [ ] 4.2 运行 `npm run build`（tsc strict 零错误）与 `bun test` 全绿
