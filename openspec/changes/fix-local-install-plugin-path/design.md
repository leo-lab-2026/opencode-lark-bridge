# 修复方案

## 方案：移除手动注册逻辑，依赖自动发现

### 背景

OpenCode 会自动扫描并加载 `.opencode/plugins/` 目录下的插件：
- 单个 `.ts` 或 `.js` 文件会被直接加载
- 目录形式的插件只要有入口点（`exports`、`module`、`main` 或 `index.js`）就会被加载

我们的插件是目录形式，包含：
- `package.json`（有 `main: "./dist/index.js"`）
- `dist/index.js`
- 其他支持文件

### 实现步骤

1. **修改 `scripts/lib/config-register.sh`**：
   - 移除所有插件注册逻辑
   - 添加注释说明 OpenCode 会自动发现 `.opencode/plugins/` 下的插件

2. **修改 `scripts/install-local.sh`**：
   - 移除 `register_plugin_config` 调用
   - 添加注释说明插件会被自动发现

3. **更新 README.md**：
   - 删除手动注册插件的说明
   - 添加自动发现机制的说明
   - 如果用户手动配置，说明正确的路径格式

### 风险评估

- **低风险**：移除手动注册逻辑不会影响已安装的插件
- **兼容性**：用户现有的配置文件不会被修改，只是不再自动添加
- **文档**：更新文档确保用户了解自动发现机制

### 验证

1. 运行 `npm run install:local`
2. 确认不会修改 `.opencode/opencode.jsonc`
3. 启动 OpenCode，验证插件被正确加载
4. 触发权限操作，验证飞书收到通知
