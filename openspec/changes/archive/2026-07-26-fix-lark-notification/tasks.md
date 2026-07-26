## 1. 复现问题与定位根因

- [x] 1.1 检查编译产物完整性：确认 `dist/` 目录包含所有必要文件（`index.js`, `cli.js`, `types.d.ts` 等）
- [x] 1.2 检查插件安装结构：确认 `.opencode/plugins/opencode-lark-bridge/` 的文件布局与 OpenCode 期望一致
- [x] 1.3 检查配置文件：确认 `opencode-lark-bridge.config.jsonc` 存在且可被插件正确解析
- [x] 1.4 运行测试：执行 `bun test`，确认现有测试全部通过，并观察是否有与通知相关的失败用例
- [x] 1.5 手动复现：构造模拟事件对象，调用 `createEventHandler` + `createLarkNotifier`，验证是否执行 lark-cli 命令

## 2. 修复根因

- [x] 2.1 根据根因定位结果，修复导致通知失效的具体代码或配置问题
  - 修复 `package.json` 添加 `"main": "./index.js"`，确保 OpenCode 能正确解析插件入口
  - 修复 `src/events/permission-mapper.ts` 的 `mapPermissionEvent`，兼容 OpenCode 真实传入的 `Permission` 对象格式（使用 `type` 字段替代缺失的 `tool` 字段，使用 `pattern` 字段提取 resource）
- [x] 2.2 若根因是编译/部署脚本问题，同步修改 `package.json` 中的 install 脚本或 `scripts/install-*.sh`
- [x] 2.3 配置加载路径无问题，无需更新文档（根因是 package.json 缺少 main 字段和 permission-mapper 解析逻辑）

## 3. 验证修复

- [x] 3.1 重新运行 `bun test`，确认所有测试通过（包括新增回归测试）
- [x] 3.2 重新编译并本地安装：`npm run install:local`，检查文件是否完整部署到 `.opencode/plugins/`
- [x] 3.3 手动验证：构造事件对象触发 handler，确认 lark-cli 命令被正确构造并执行
- [x] 3.4 运行 `tsc`，确认零类型错误

## 4. 根因消除检查

- [x] 4.1 确认问题代码已移除或修复，不会在其它路径重现
- [x] 4.2 确认修复未引入新的编译错误或类型错误
