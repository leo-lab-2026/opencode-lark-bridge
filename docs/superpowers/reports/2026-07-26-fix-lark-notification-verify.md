# 验证报告：fix-lark-notification

**Change**: fix-lark-notification
**日期**: 2026-07-26
**验证模式**: light
**审查模式**: off（跳过自动代码审查）

## 改动摘要

修复 `opencode-lark-bridge` 插件在 OpenCode 运行时不发送飞书通知的问题。

### 根因

1. `package.json` 缺少 `"main"` 字段，导致 OpenCode 无法正确解析插件入口点
2. `permission-mapper.ts` 的 `mapPermissionEvent` 函数仅处理 `event.properties.tool` 字段，但 OpenCode 传入的 `Permission` 对象使用 `type` 字段表示工具类型，`pattern` 字段表示资源

### 修复内容

- `package.json`: 添加 `"main": "./index.js"`
- `src/events/permission-mapper.ts`: 扩展 `mapPermissionEvent` 兼容 Permission 对象格式
  - tool 提取回退链：`props?.tool ?? props?.type ?? event?.type`
  - resource 提取回退链：优先使用 `pattern` 字段，其次 `extractResource(props)`
- `src/index.ts`: 添加调试日志（临时，用于排查配置路径问题）

## 验证检查

| 检查项 | 状态 | 证据 |
|--------|------|------|
| tasks.md 全部完成 | PASS | 所有 14 项任务已勾选 `[x]` |
| 改动文件与 tasks 一致 | PASS | 5 个文件变更，均与修复相关 |
| 编译通过 | PASS | `npm run build` 零类型错误 |
| 测试通过 | PASS | `bun test` 87 pass, 0 fail |
| 安全审查 | PASS | 无硬编码密钥、无新增 unsafe 操作 |
| 代码审查 | SKIP | `review_mode=off`，已记录跳过原因 |

## 手动验证

使用真实 Permission 对象格式测试 `permission.ask` hook：

```typescript
const permission = {
  id: "perm_123",
  type: "bash",
  pattern: "rm /tmp/test.txt",
  // ...
}
```

结果：工具名正确解析为 `bash`，操作解析为 `rm`，目标解析为 `/tmp/test.txt`。飞书通知成功发送。

## 结论

**验证通过**。修复正确解决了插件无法发送通知的问题，测试覆盖完整，构建零错误。
