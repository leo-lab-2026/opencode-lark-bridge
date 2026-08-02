## Why

`opencode-lark-bridge@0.2.0` 发布到 npm 后，用户通过 `npm install opencode-lark-bridge` 安装并重启 opencode，无法收到任何飞书通知。但开发者本地安装（`npm run install:local`）功能正常。根因是 `package.json` 的 `main` 字段指向不存在的根级 `./index.js`，而 npm 安装后实际入口文件位于 `dist/index.js`（嵌套子目录），导致 opencode `import()` 入口文件失败、插件无法加载。

## What Changes

- 修复 `package.json` 的 `main` 字段：`./index.js` -> `./dist/index.js`，使其与 npm 发布包的实际目录结构一致
- 统一 `scripts/install-local.sh` 和 `scripts/install-global.sh` 的 dist 复制方式：`cp -r dist/*` -> `cp -r dist`（保留子目录，与 `installer.ts` 的 `copyPluginFiles` 行为一致），使三种安装路径（npm install postinstall、本地安装脚本、全局安装脚本）产出相同的目录结构

## Capabilities

### New Capabilities
无

### Modified Capabilities
无（纯打包路径修复，不改变插件行为规格）

## Impact

- **package.json**: `main` 字段值变更，影响 Node/Bun 模块解析入口
- **scripts/install-local.sh**: dist 复制方式变更（扁平 -> 嵌套），产物目录结构从 `<plugin_dir>/index.js` 变为 `<plugin_dir>/dist/index.js`
- **scripts/install-global.sh**: 同上
- **installer.ts**: 无需改动，已正确使用嵌套结构
- **测试**: `tests/installer.test.ts` 已断言 `dist/index.js`（嵌套），无需改动；shell 脚本无直接测试
- **向后兼容**: 修复后 dev 安装结构变更，但 `main` 字段同步指向 `./dist/index.js`，两种安装方式均能正确解析入口
