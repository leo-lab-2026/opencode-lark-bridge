## Context

当前 `scripts/install-local.sh` 的安装流程分为四步：构建 → 复制产物到 `.opencode/plugins/` → 安装依赖 → 种子插件配置（`opencode-lark-bridge.config.jsonc`）。但 opencode 主配置文件（`opencode.jsonc`/`opencode.json`）中的 `plugin` 数组注册需要用户手动完成，导致安装后插件不会自动加载。

OpenCode 配置文件体系：
- 全局：`~/.config/opencode/opencode.jsonc` 或 `opencode.json`
- 项目级：`.opencode/opencode.jsonc`、`.opencode/opencode.json`、`./opencode.jsonc`、`./opencode.json`

插件注册格式：
```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    ".opencode/plugins/opencode-lark-bridge"
  ]
}
```

约束：脚本为 bash，不能依赖 Node.js 运行时（虽然项目用 Bun，但脚本应尽量自包含）。

## Goals / Non-Goals

**Goals:**
- 安装脚本自动检测 opencode 主配置文件是否已注册本插件
- 未注册时按优先级写入项目级配置文件
- 严格不修改全局配置文件
- 保持脚本健壮性：配置文件格式异常时不破坏用户数据

**Non-Goals:**
- 不修改 TypeScript 源码或 postinstall 逻辑
- 不修改插件配置（`opencode-lark-bridge.config.jsonc`）的种子逻辑
- 不处理 `install-global.sh`（全局安装路径不同，单独处理）
- 不解析 JSONC 注释的完整语义（仅做字符串/数组层面的检查）

## Decisions

### 决策 1：使用 `jq` 处理 JSON，回退到 `grep` 检查

**选择**：优先用 `jq` 解析和修改配置文件；`jq` 不可用时用 `grep` 做存在性检查，写入时用 `sed`/`awk`。

**理由**：
- `jq` 是处理 JSON 的事实标准，能安全处理数组操作
- JSONC 包含注释，`jq` 会报错，需要先剥离注释
- 项目已有 `mise` 管理工具链，`jq` 是常见依赖
- 纯 bash 解析 JSON 不可靠，容易引入安全漏洞

**替代方案**：
- 调用 `bun -e` 执行 JS 解析：引入运行时依赖，违反脚本自包含原则
- 纯 `grep`/`sed`：对数组边界判断不可靠

### 决策 2：JSONC 注释剥离策略

**选择**：用 `sed` 剥离单行 `//` 注释和 `/* */` 块注释后再交给 `jq`。

**理由**：
- opencode 配置文件是 JSONC，包含 `//` 注释
- `jq` 不支持 JSONC，需要预处理
- 简单的 sed 剥离对配置文件场景足够（不会出现字符串内 `//` 的边界情况，因为 plugin 数组元素是路径字符串）

**风险**：字符串内包含 `//`（如 URL）会被误删。但 `plugin` 数组元素是相对路径，不含 `//`，可接受。

### 决策 3：配置文件优先级与写入目标

**选择**：
1. 检查阶段：扫描所有 6 个配置文件位置（2 全局 + 4 项目级），任一已注册即跳过
2. 写入阶段：按项目级优先级 `.opencode/opencode.jsonc` > `.opencode/opencode.json` > `./opencode.jsonc` > `./opencode.json`，选择第一个存在的 **jsonc** 文件；若没有 jsonc 文件，选第一个存在的 json 文件；若都不存在，创建 `.opencode/opencode.jsonc`

**理由**：
- 用户要求优先写入 jsonc 类型
- 项目级配置不应被全局配置覆盖
- 创建新文件时用 jsonc 以支持注释

### 决策 4：新建配置文件骨架

**选择**：
```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    ".opencode/plugins/opencode-lark-bridge"
  ]
}
```

**理由**：包含 `$schema` 便于编辑器提示，`plugin` 数组直接包含插件路径。

### 决策 5：插件路径格式

**选择**：使用相对路径 `.opencode/plugins/opencode-lark-bridge`。

**理由**：
- 与 README 文档一致
- 相对路径便于项目迁移
- opencode 支持相对路径解析

## Risks / Trade-offs

- **[JSONC 注释剥离误伤]** → 仅在 `jq` 处理前剥离，写入时保留原文件内容（用 `jq` 修改后写回会丢失注释）。缓解：写入新插件时用 `sed` 在 `plugin` 数组末尾插入，而非 `jq` 全量重写
- **[配置文件格式异常]** → 脚本应在解析失败时输出警告并跳过，不中断安装流程
- **[jq 不存在]** → 回退到 `grep` 检查 + `sed` 写入，功能降级但可用
- **[多配置文件冲突]** → 检查阶段全量扫描，确保不会重复注册
