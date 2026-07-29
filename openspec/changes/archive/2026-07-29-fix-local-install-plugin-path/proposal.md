# 修复本地安装插件配置路径

## 问题描述

按照 README.md 进行本地开发者安装后，执行 `npm run install:local`，脚本会在项目级 `.opencode/opencode.jsonc` 中添加插件配置：

```jsonc
{
  "plugin": [
    ".opencode/plugins/opencode-lark-bridge"
  ]
}
```

但这样配置后飞书收不到通知，插件没有被 OpenCode 正确识别和加载。

## 根因分析

根据 OpenCode 官方文档（https://opencode.ai/v2/docs/build/plugins）和 [GitHub issue #28384](https://github.com/anomalyco/opencode/issues/28384)：

**路径解析规则**：
- 当配置文件位于 `.opencode/opencode.jsonc` 时，OpenCode 解析配置文件路径为 `.opencode/opencode.jsonc`
- `path.dirname()` 得到 `.opencode/` 作为基准路径
- 然后相对这个基准路径解析插件路径

**当前错误**：
- 配置路径：`.opencode/plugins/opencode-lark-bridge`
- 基准路径：`.opencode/`
- 错误解析结果：`.opencode/.opencode/plugins/opencode-lark-bridge`（路径重复）

**正确方案**：
1. **完全不配置**：`.opencode/plugins/` 下的插件会被自动发现（推荐）
   - OpenCode 自动扫描 `.opencode/plugins/` 目录
   - 目录形式的插件只要有 `exports`、`module`、`main` 入口点或 `index.js` 文件就会被加载
2. **如果手动配置**：应使用 `./plugins/opencode-lark-bridge`（相对于 `.opencode/` 目录）

## 修复目标

1. 修改 `scripts/lib/config-register.sh` 中的 `PLUGIN_PATH` 为正确的相对路径
2. 更新 README.md 中关于手动注册插件的文档说明
3. 添加注释说明 `.opencode/plugins/` 目录会被自动发现，通常无需手动配置
