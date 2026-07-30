## 1. 修复安装脚本

- [x] 1.1 修改 `scripts/lib/config-register.sh`，实现实际的配置注册逻辑（而非仅输出提示）
- [x] 1.2 更新 `scripts/install-local.sh` 中的配置注册调用
- [x] 1.3 更新 `scripts/install-global.sh` 中的配置注册调用
- [ ] 1.4 验证脚本在配置文件不存在时正确创建，存在时正确更新

## 2. 更新文档和注释

- [x] 2.1 更新 `scripts/lib/config-register.sh` 中的注释，移除误导性的"无需手动注册"声明
- [x] 2.2 更新 README.md 中的插件安装说明，明确 OpenCode V1 需要显式配置

## 3. 测试验证

- [x] 3.1 清理现有插件安装：`rm -rf .opencode/plugins/opencode-lark-bridge`
- [x] 3.2 删除配置文件：`rm -f .opencode/opencode.jsonc`
- [x] 3.3 执行安装：`npm run install:local`
- [x] 3.4 验证配置文件已创建并包含正确的插件路径
- [ ] 3.5 启动 OpenCode，执行需要权限的操作，验证飞书通知正常接收
