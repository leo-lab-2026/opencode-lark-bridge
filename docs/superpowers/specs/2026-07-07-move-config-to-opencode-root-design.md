---
comet_change: move-config-to-opencode-root
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-08-move-config-to-opencode-root
status: final
---

# opencode-lark-bridge 配置文件位置调整设计

## 背景

当前 `opencode-lark-bridge` 部署后，配置文件 `opencode-lark-bridge.config.jsonc` 被放在 `.opencode/plugins/opencode-lark-bridge/` 目录下。插件目录应只存放可替换的编译产物，用户凭证/配置放在插件目录中会在重新安装时被误覆盖或备份。本次调整将配置文件迁移到 `.opencode` 根目录，并支持项目级优先、全局级兜底的两级读取策略。

## 目标

- 配置文件默认位于 `.opencode/opencode-lark-bridge.config.jsonc`（项目级或全局级 `.opencode` 根目录）。
- 运行时优先读取项目级 `.opencode` 目录下的配置文件；不存在时回退到全局级 `~/.opencode/`。
- 安装脚本只在对应层级的 `.opencode` 目录下创建配置文件；如果文件已存在，保留原文件，不删除重建。
- 不保留旧插件目录内的配置路径作为兼容路径。

## 非目标

- 不修改配置格式或配置校验逻辑。
- 不引入新的外部依赖。
- 不自动迁移旧位置配置文件到新位置。

## 技术方案

### 运行时配置解析

修改 `packages/opencode-lark-bridge/src/index.ts` 中的 `resolveConfigPath`：

```typescript
function resolveConfigPath(ctx: { directory: string }): string | null {
  const candidates = [
    path.join(ctx.directory, CONFIG_FILE),
    path.join(os.homedir(), ".opencode", CONFIG_FILE),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return path.resolve(candidate)
    }
  }
  return null
}
```

其中 `ctx.directory` 在项目级安装时为项目根目录下的 `.opencode`，在全局安装时为用户主目录下的 `.opencode`。

### 安装脚本

修改 `packages/opencode-lark-bridge/scripts/install-local.sh`：

1. 继续编译并部署插件到 `.opencode/plugins/opencode-lark-bridge/`。
2. 移除将示例配置复制到插件目录的逻辑。
3. 新增逻辑：检查 `$PROJECT_ROOT/.opencode/opencode-lark-bridge.config.jsonc`，若不存在则复制示例配置到该位置；若已存在则跳过。
4. 移除对插件目录内配置文件的备份/恢复逻辑。

### 日志路径

继续使用 `path.resolve(path.dirname(configPath), config.log_file)`。当日志路径为相对路径时，日志会写入配置所在目录的 `./logs/` 下，与新位置保持一致。

## 测试策略

- 更新 `packages/opencode-lark-bridge/tests/index.test.ts`：
  - 项目级 `.opencode` 目录命中
  - 全局级 `~/.opencode` 目录命中
  - 配置文件缺失时返回 no-op hooks
- 手动验证 `npm run install:local` 后 `.opencode/opencode-lark-bridge.config.jsonc` 被创建且重复安装不覆盖。

## 风险与回退

- **旧位置配置失效**：已确认不保留旧路径，安装脚本会在新位置创建示例配置。
- **全局路径误判**：通过 `os.homedir()` 计算全局 `.opencode`，仅在项目级未命中时查找。
- **安装脚本依赖 `bun`**：构建环境已具备 bun，不变。
