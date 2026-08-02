# Tasks: fix-npm-install-entry-point

- [x] 修复 `package.json` 的 `main` 字段：`./index.js` -> `./dist/index.js`
- [x] 统一 `scripts/install-local.sh`：`cp -r dist/* "$PLUGIN_DIR/"` -> `cp -r dist "$PLUGIN_DIR/"`
- [x] 统一 `scripts/install-global.sh`：`cp -r dist/* "$PLUGIN_DIR/"` -> `cp -r dist "$PLUGIN_DIR/"`
- [x] 运行 `tsc` 确认类型检查通过
- [x] 运行 `bun test` 确认全部测试通过
- [x] 运行 `npm pack --dry-run` 确认 npm 包结构与 main 字段一致
