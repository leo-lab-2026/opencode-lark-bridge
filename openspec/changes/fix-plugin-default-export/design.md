# 修复方案

## 方案：添加默认导出

### 背景

OpenCode 插件系统要求每个插件模块必须有一个**默认导出**。默认导出可以是：
- V2 格式：包含 `id` 和 `setup` 的对象
- V1 格式：异步函数，接收 `ctx` 参数并返回 hooks 对象

我们当前的插件使用 V1 格式（命名导出），需要改为默认导出。

### 实现步骤

1. **修改 `src/index.ts`**：
   - 保留现有的命名导出 `export const OpenCodeLarkBridge`（向后兼容）
   - 添加默认导出：`export default OpenCodeLarkBridge`

2. **修改 `src/index.ts` 的导出语句**：
   ```typescript
   // 保持命名导出（向后兼容）
   export const OpenCodeLarkBridge = async (ctx: any) => { ... }
   
   // 添加默认导出（OpenCode 自动发现需要）
   export default OpenCodeLarkBridge
   ```

3. **更新 README.md**：
   - 说明插件导出格式要求
   - 添加调试方法（如何验证插件被加载）

### 风险评估

- **低风险**：添加默认导出不破坏现有代码
- **向后兼容**：保留命名导出，不会影响已手动注册的配置
- **测试覆盖**：现有测试验证功能正确性

### 验证

1. 运行 `npm run build` 和 `npm run install:local`
2. 启动 OpenCode，检查插件是否被加载
3. 触发权限操作，验证飞书收到通知
4. 检查日志文件 `/tmp/opencode-lark-bridge-debug.log`
