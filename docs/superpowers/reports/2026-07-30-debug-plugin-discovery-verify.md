# 验证报告：debug-plugin-discovery

**日期**: 2026-07-30
**Change**: debug-plugin-discovery
**Workflow**: hotfix

## 验证范围

本次 hotfix 修复了插件安装脚本，确保插件路径被正确注册到 `.opencode/opencode.jsonc`。

## 验证步骤

### 1. 清理并重新安装

```bash
rm -rf .opencode/plugins/opencode-lark-bridge
rm -f .opencode/opencode.jsonc
npm run install:local
```

**结果**: ✅ 通过
- 插件成功安装到 `.opencode/plugins/opencode-lark-bridge/`
- 配置文件 `.opencode/opencode.jsonc` 自动创建
- 配置内容正确：`{"plugin": ["./plugins/opencode-lark-bridge"]}`

### 2. 功能验证

用户重启 OpenCode 后，在新的会话中执行需要权限的操作，确认收到飞书通知。

**结果**: ✅ 通过（用户确认）

## 验证结论

所有验证项通过，问题已解决。

## 修复内容

1. 修改 `scripts/lib/config-register.sh`，主动注册插件到配置文件
2. 更新 README.md，明确说明 OpenCode V1 需要显式配置插件路径
3. 配置字段使用 `plugin`（单数），路径相对于 `.opencode/` 目录
