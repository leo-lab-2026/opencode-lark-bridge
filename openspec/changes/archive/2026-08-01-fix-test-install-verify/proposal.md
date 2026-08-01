# Fix test-install-verify：postinstall 递归导致 plugin dist/ 丢失

## 问题描述

`npm run test:install`（scripts/test-install.sh）第 4 步项目级安装验证失败：

```
FAIL: plugin dist/ not found
```

postinstall 输出显示安装成功（`✓ opencode-lark-bridge installed to ...`），但验证时 `.opencode/plugins/opencode-lark-bridge/dist/` 目录不存在。

## 根因分析

安装链路：

1. `installPlugin`（src/installer.ts）先把 dist、package.json、bun.lock 复制到 pluginDir（`copyPluginFiles`）
2. 随后 `installDependencies` 在 pluginDir 内运行 `bun install --production`（src/installer.ts:67）
3. **bun/npm 默认执行 package.json 中的 postinstall 脚本**。pluginDir 内刚复制来的 package.json 带 postinstall：`node -e "if (require('fs').existsSync('./dist/postinstall.js')) execFileSync(...)"` —— 此时 `dist/postinstall.js` 已存在（第 1 步复制），于是触发**递归 installPlugin**
4. 递归执行时 `import.meta.url` 指向 `pluginDir/dist/postinstall.js`，`getPackageRoot()` 解析为 pluginDir 自身；`copyPluginFiles(pluginDir, pluginDir)` 中 `from === to === pluginDir/dist`，先 `rmSync` 删除 dist，随后 `cpSync(from, to)` 因源已被删除抛 ENOENT，被 catch 后终止递归 —— **dist 目录永久丢失**

已复现验证：在 pluginDir 单独运行 `bun install --production` 即触发 `$ node -e "...postinstall..."` 并递归安装。

## 修复目标

消除插件目录内依赖安装时的 postinstall 递归，保证 `dist/` 在安装后存在。不改变对外行为：用户在项目/全局安装时 postinstall 自动部署仍然有效（`--ignore-scripts` 只作用于 pluginDir 内部依赖安装）。

## 影响面

- `src/installer.ts`：`installDependencies` 两条安装命令（bun/npm）加 `--ignore-scripts`
- `tests/installer.test.ts`：断言命令包含 `--ignore-scripts`
- `scripts/test-install.sh`：无需改动（修复后验证自然通过）
