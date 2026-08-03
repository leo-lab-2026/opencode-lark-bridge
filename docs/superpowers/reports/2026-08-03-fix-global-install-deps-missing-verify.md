# Verification Report: fix-global-install-deps-missing

日期：2026-08-03
Change：`fix-global-install-deps-missing`（hotfix, open → build → verify）
语言：zh-CN

## Summary

| Dimension    | Status                             |
|--------------|------------------------------------|
| Completeness | 9/9 tasks 完成，无 delta spec 要求 |
| Correctness  | 无 spec requirement（hotfix 无 delta spec） |
| Coherence    | design.md 5 项决策全部实现          |

## 检查项

### 1. tasks.md 全部任务已完成

9/9 `[x]`，无未完成项。

### 2. 实现符合 design.md 高层设计决策

| design.md 决策 | 实现 | 状态 |
|---------------|------|------|
| `@opencode-ai/plugin` 移到 devDependencies | `package.json` dependencies 只剩 `comment-json` | ✅ |
| `FILES_TO_COPY` 增加 `node_modules`，用 `rmSync + cpSync` | `src/installer.ts` `item === "dist" \|\| item === "node_modules"` | ✅ |
| `installPlugin` 检查 `node_modules/comment-json` 存在时跳过 `installDependencies` | `src/installer.ts` `depsInstalled` 分支 | ✅ |
| `installDependencies` 失败时打印 stdout/stderr/exitCode | `src/installer.ts` `tryCmd` catch 打印 `e.status`/`e.stderr`/`e.stdout` | ✅ |
| 移除 `src/index.ts` 调试代码 | 4 处 `appendFileSync` 全部移除 | ✅ |

### 3. 构建通过

`npm run build`（tsc）：exit 0。

### 4. 测试通过

`bun test`：157 pass, 0 fail, 326 expect() calls。
新增测试：
- `copyPluginFiles` 复制 node_modules（存在/不存在两种场景）
- `installPlugin` 跳过 `installDependencies`（node_modules 已复制时）
- `installPlugin` 调用 `installDependencies`（node_modules 缺失时）

### 5. 无明显安全问题

- 代码中无硬编码密钥（app_secret/app_id 只在用户配置文件中）
- 无新增 unsafe 操作
- `grep` 验证 src/tests 无凭证字符串

### 6. 端到端验证（全局安装）

1. `npm pack` 打包 `opencode-lark-bridge-0.2.1.tgz`
2. `npm install -g opencode-lark-bridge-0.2.1.tgz --foreground-scripts`：
   - postinstall 输出 `Dependencies already present from copy, skipping installDependencies`
   - 全局插件目录 `~/.config/opencode/plugins/opencode-lark-bridge/` 有 `node_modules/`（`comment-json` + `esprima` + `array-timsort`，500K）
3. opencode 1.18.11 运行验证：
   - 插件日志 `~/.config/opencode/logs/opencode-lark-bridge.log` 显示 `Plugin initialized` + `Plugin hooks registered`
   - 触发权限申请（`rm /tmp/test-file.txt`）→ 日志显示 `Sending notification` + `Executing lark-cli command`
   - lark-cli `im +messages-send` 返回 `message_id`，通知成功到达飞书
   - session.idle 触发完成通知（`✅ 任务完成`）

## 问题清单

无 CRITICAL / WARNING / SUGGESTION 问题。

## 跳过项说明

- 无 delta spec（hotfix 不改变已有 spec 验收场景）
- `review_mode: off`（hotfix 默认），跳过自动代码审查；本次改动 diff 已在验证中人工复核

## 结论

所有检查通过，无 CRITICAL/IMPORTANT 问题，可以进入 archive。
