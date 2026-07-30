# 修复插件默认导出问题

## 问题描述

修复本地安装插件配置路径问题后，执行 `npm run install:local`，插件被部署到 `.opencode/plugins/opencode-lark-bridge/` 目录，但 OpenCode 没有自动发现和加载插件，飞书收不到通知。

## 根因分析

根据 OpenCode 官方文档（https://opencode.ai/v2/docs/build/plugins）和源码（`packages/opencode/src/plugin/shared.ts`）：

**OpenCode 插件加载机制**：
1. OpenCode 自动扫描 `.opencode/plugins/` 目录
2. 对于目录形式的插件，检查是否有入口点（`exports`、`module`、`main` 或 `index.js`）
3. 加载插件模块时，查找**默认导出**（`export default`）
4. 默认导出应包含插件配置（V2 格式：`id` + `setup`）或函数（V1 格式）

**当前问题**：
- 插件代码只有**命名导出**：`export const OpenCodeLarkBridge = async (ctx) => { ... }`
- **缺少默认导出**（`export default`）
- OpenCode 找不到默认导出，跳过该插件

**参考源码**：
```typescript
// packages/opencode/src/plugin/shared.ts:readV1Plugin
const value = mod.default  // 查找默认导出
if (!isRecord(value)) {
  throw new TypeError(`Plugin ${spec} must default export an object with server()`)
}
```

## 修复目标

1. 在 `src/index.ts` 中添加默认导出
2. 默认导出插件函数 `OpenCodeLarkBridge`
3. 更新 README.md 说明正确的插件导出格式
4. 验证 OpenCode 能够自动发现和加载插件
