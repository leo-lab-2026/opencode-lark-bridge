# Design：依赖安装禁用 lifecycle scripts

## 方案

`installDependencies`（src/installer.ts:54-78）中的两条命令均追加 `--ignore-scripts`：

- `bun install --production --ignore-scripts`
- `npm install --production --ignore-scripts`

bun 与 npm 均支持该 flag，语义一致：安装依赖但不执行任何 lifecycle 脚本（pre/postinstall 等）。

## 为什么能消除根因

递归的唯一触发点是 pluginDir/package.json 的 postinstall 脚本。禁用 scripts 后，pluginDir 内 `bun install` 不会运行该脚本，递归不复存在，`copyPluginFiles` 只执行一次，`dist/` 保持不变。

## 对既有行为的验证

- 用户级安装（npm install tarball）：postinstall 由 npm 在包目录执行（非 pluginDir），不受 `--ignore-scripts` 影响 —— 自动部署仍然工作
- 脚本 test-install.sh 第 4 步手动运行 postinstall 的路径同样不受影响（直接 `node dist/postinstall.js`，不经 installDependencies）

## 非目标

- 不改 postinstall 脚本本身（用户级部署依赖它）
- 不改 `copyPluginFiles` 的 from==to 防御（根因消除后该路径不可达；避免扩大改动面）

## 验证计划

1. 新增/更新单元测试：断言 installDependencies 传给 exec 的命令包含 `--ignore-scripts`
2. 运行 `bun test` 全量通过
3. 手动运行 `npm run test:install` 全流程通过（项目级/全局/CLI 三段验证）
