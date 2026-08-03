## Context

README.md 现有「安装」章节描述 `npm install` / `npx init` 路径（触发 postinstall 自动注册插件到 `.opencode/plugins/` 并写入 `opencode.jsonc`）。OpenCode 另支持在 `opencode.jsonc` 的 `plugin` 数组直接声明 npm 包名，启动时自动用 Arborist 安装（`ignoreScripts: true`，postinstall 不执行）。两种路径并存，但文档未覆盖后者，且后者因 postinstall 跳过需用户手动创建配置文件。研究结论（包名 `opencode-lark-bridge`，缓存目录 `~/.cache/opencode/packages/`，配置查找基于 `ctx.directory`）来自上一会话的源码核实。

## Goals / Non-Goals

**Goals:**
- 让用户照 README 新章节即可用「opencode.jsonc 声明 npm 包名」方式启用插件
- 提供一段 OpenCode agent 可读的提示词，使其自动区分全局/项目级完成安装与配置

**Non-Goals:**
- 不改源码、不改安装脚本、不改配置格式
- 不替换现有 `npm install` / `npx init` 章节，仅并列新增

## Decisions

1. **新章节位置**：放在现有「安装」章节的「开发者本地安装」之后、「配置」章节之前，作为「安装」下的子章节「通过 opencode.jsonc 声明（免手动安装）」。
   - 理由：与现有安装方式并列，用户可对比选择；放在开发者本地安装之后避免打断主流安装流程。

2. **提示词章节位置**：独立章节「OpenCode agent 自动安装提示词」，置于「安装」章节末尾。
   - 理由：提示词是供 agent 读取的特殊内容，独立章节更易被引用。

3. **提示词内容结构**：区分「项目级」与「全局」两段，每段包含：目标配置文件路径、`opencode.jsonc` 的 `plugin` 字段写法、配置文件创建步骤（从包内 example 复制）、`lark-cli` 前置检查、避免双重注册提醒。
   - 理由：agent 需要明确路径与步骤才能准确执行；双重注册会导致双重通知（OpenCode 文档明确 local+npm 分别加载）。

4. **包名表述**：统一用 `opencode-lark-bridge`（无 scope），并在新章节提示 scoped 名 `@leo-lab-2026/opencode-lark-bridge` 不存在。
   - 理由：避免用户照错误包名配置导致 404。

## Risks / Trade-offs

- [OpenCode 版本差异] → 提示词与文档基于当前 dev 分支 + 本地 1.18.11 验证；若未来 OpenCode 改变 npm 插件加载机制（如移除 V0 legacy 兼容、改 `ignoreScripts`），文档需更新。缓解：文档标注验证版本。
- [提示词被 agent 误读] → 提示词需明确「读 README 后执行」而非「自行推断」。缓解：提示词用祈使句 + 明确路径。
- [用户混淆两种安装方式] → 同时存在 `npm install`（postinstall 自动注册）和 `opencode.jsonc` 声明（postinstall 跳过）两种方式。缓解：新章节开头用对比说明差异。
