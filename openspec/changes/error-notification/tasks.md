## 1. Error Mapper 实现

- [x] 1.1 创建 `src/events/error-mapper.ts`，导出 `mapErrorEvent(event, target, template?): NotificationMessage`
- [x] 1.2 实现错误信息提取：从 `event.properties.error` 提取 `type`→`{errorType}`、`message`→`{errorMessage}`，从 `event.properties.sessionID` 提取→`{sessionID}`，缺失降级为 `unknown`
- [x] 1.3 实现默认模板：`⚠️ OpenCode Error\nSession: {sessionID}\nType: {errorType}\nMessage: {errorMessage}\nProject: {projectName}`
- [x] 1.4 实现模板渲染：替换 `{errorType}`、`{errorMessage}`、`{sessionID}`、`{projectName}`，支持自定义 template 参数

## 2. Event Handler 集成

- [x] 2.1 在 `src/events/event-handler.ts` 导入 `mapErrorEvent`
- [x] 2.2 在 `handle` 方法中新增 `eventType === "session.error"` 分支，位于 `question.asked` 分支之后、`permission.asked` 默认 return 之前
- [x] 2.3 实现去重逻辑：以 `error:<sessionID>` 为 key，复用 `lastSent` Map 和 `debounce_ms` 配置
- [x] 2.4 子代理错误处理：不跳过子代理的 `session.error`，但清理子代理的 `pendingChildren` 追踪状态（从 `subagentSessionIds` 移除并从父会话 `pendingChildren` 删除）
- [x] 2.5 使用 `getEffectiveTarget(config, "error")` 解析 target，调用 `mapErrorEvent` 渲染消息，调用 `notifier.send` 发送
- [x] 2.6 注入 `projectName` 到 error event properties（复用 `enhanceEvent` 的 projectName 注入逻辑，确保 error 通知包含项目名）

## 3. 配置与模板更新

- [x] 3.1 在 `opencode-lark-bridge.config.example.jsonc` 新增 `"error"` category 示例（含 target 和 template 注释）
- [x] 3.2 确认 `src/config.ts` 的 `getEffectiveTarget` 对 `"error"` category 的回退逻辑正常工作（无需修改，通用逻辑已支持）
- [x] 3.3 确认 `src/types.ts` 的 `PluginConfig.categories` 类型 `Record<string, CategoryConfig>` 已覆盖 error category（无需修改类型）

## 4. 插件注册更新

- [x] 4.1 更新 `src/index.ts` 中 hook 注册日志，将 `"error"` 加入事件类型说明
- [x] 4.2 确认 `enhanceEvent` 对 `session.error` 事件正确注入 `projectName`（新增 session.error 分支或在通用逻辑中处理）

## 5. 测试

- [x] 5.1 创建 `tests/error-mapper.test.ts`：标准 payload 提取、缺失 sessionID 降级、自定义模板渲染、默认模板渲染
- [x] 5.2 在 `tests/event-handler.test.ts` 新增 session.error 用例：主会话错误通知、子代理错误通知（不跳过）、去重（debounce_ms 内重复跳过）、target 回退
- [x] 5.3 运行 `bun test` 确认全部通过
- [x] 5.4 运行 `npm run build`（tsc）确认 strict 零类型错误

## 6. 文档更新

- [x] 6.1 更新 `README.md` 中支持的通知类型说明，加入错误通知
- [x] 6.2 更新 `docs/OPENCODE_PLUGIN_DEV_GUIDE.md` 或 `AGENTS.md` 中 CODE MAP，加入 `mapErrorEvent` 符号说明（如适用）