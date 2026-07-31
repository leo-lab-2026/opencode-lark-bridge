# Brainstorm Summary

- Change: npm-install-full-deployment
- Date: 2026-07-31

## 确认的技术方案

### 模块组织
- `src/installer.ts`（新增）：`installPlugin(options)` + `copyPluginFiles(pluginDir, sourceDir)` + `installDependencies(pluginDir, execFn?)`
- `src/config-register.ts`（新增）：`registerPluginConfig(options)` - comment-json 简化实现
- `src/postinstall.ts`（保留增强）：`isGlobalInstall` + `resolveTargetDir` + `initConfig` + `main()`（调用 installPlugin）
- `src/cli.ts`（增强）：新增 `install` 子命令

### 核心设计
- `installPlugin` 接受 `{ global?: boolean; execFn?: Function }`，execFn 默认 execSync，测试时注入 mock
- `config-register.ts` 用 comment-json 解析 JSONC -> 操作对象 -> 序列化，统一处理已注册检查/新建/追加，项目级用相对路径，全局用绝对路径
- 发布包路径靠 `import.meta.url` 解析包根目录
- 依赖安装优先 bun install --production，回退 npm install --production

### npm 发布整改
- LICENSE 文件（MIT）+ package.json 补充 description/keywords/license/repository/homepage/bugs/author/engines
- `prepublishOnly`（build + test）+ `pack:dry`（npm pack --dry-run）
- `docs/PUBLISH.md` 发布流程文档

### 发布前本地测试安装方案
- `scripts/test-install.sh`：npm pack -> 临时目录安装 -> 验证文件/配置/注册 -> 全局模式重复 -> 清理
- `npm run test:install` 一键执行

## 关键取舍与风险

- **取舍**：config-register 逻辑在 sh 和 TS 中各有一份（接受重复以保留 sh 脚本独立性）
- **风险**：postinstall 在不同包管理器下 INIT_CWD/npm_config_global 行为差异 -> 三重探测 + cwd 回退
- **风险**：postinstall 失败影响 npm install -> 全步骤 catch 静默降级
- **风险**：bun.lock 复制后版本不匹配 -> 依赖安装失败降级为警告

## 测试策略

- `tests/installer.test.ts`：installPlugin + copyPluginFiles + installDependencies（注入 mock execFn）
- `tests/config-register.test.ts`：各种 JSONC 场景（已注册/新建/追加）
- `tests/cli.test.ts`：install 子命令
- `tests/postinstall.test.ts`：保留现有，验证不被破坏
- `scripts/test-install.sh`：端到端本地安装验证

## Spec Patch

无。OpenSpec delta spec 的验收场景已足够详细，无需补充。
