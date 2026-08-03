# Tasks: fix-global-install-deps-missing

- [x] `package.json`: `@opencode-ai/plugin` 从 `dependencies` 移到 `devDependencies`
- [x] `src/installer.ts`: `FILES_TO_COPY` 增加 `node_modules`；`copyPluginFiles` 对 `node_modules` 用 `rmSync + cpSync`
- [x] `src/installer.ts`: `installPlugin` 中 `copyPluginFiles` 后检查 `node_modules/comment-json` 存在时跳过 `installDependencies`
- [x] `src/installer.ts`: `installDependencies` 的 `tryCmd` 失败时打印 stdout/stderr/exitCode
- [x] `src/index.ts`: 移除 `/tmp/opencode-lark-bridge-debug.log` 调试代码
- [x] `tests/installer.test.ts`: 新增 `node_modules` 复制断言；新增跳过 `installDependencies` 的测试
- [ ] 运行 `tsc` 确认类型检查通过
- [ ] 运行 `bun test` 确认全部测试通过
- [ ] 运行 `npm install -g` 端到端验证：全局插件目录有 node_modules，opencode 能加载插件并发通知
