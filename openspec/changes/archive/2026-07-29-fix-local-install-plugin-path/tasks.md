# 修复任务

- [x] 1. 修改 `scripts/lib/config-register.sh`，移除插件注册逻辑，添加自动发现说明
- [x] 2. 修改 `scripts/install-local.sh`，移除 `register_plugin_config` 调用
- [x] 3. 更新 README.md，修正手动注册插件的文档说明，添加自动发现机制说明
- [x] 4. 验证修复：运行 `npm run install:local` 确认不会修改配置文件
- [x] 5. 运行项目测试确保没有破坏现有功能
