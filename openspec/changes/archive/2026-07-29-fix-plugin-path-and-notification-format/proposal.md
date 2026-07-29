## Why

用户测试发现插件安装和通知格式存在三个严重 bug：

1. **插件路径解析失败**：相对路径 `.opencode/plugins/opencode-lark-bridge` 无法启动插件，只有绝对路径才工作，导致插件无法在其他项目复用
2. **多问题通知格式错误**：`question_item_template` 配置的 `{options}` 变量缩进处理不一致，只有第一个选项正确缩进，后续选项缩进丢失
3. **自定义选项格式不一致**：OpenCode 显示的"自定义输入"选项未遵循模板格式，与前置选项对齐不一致

这些问题破坏了插件的跨项目可用性和用户体验，必须立即修复。

## What Changes

- **修复插件路径解析**：让 OpenCode 正确解析相对路径形式的插件注册，实现跨项目复用
- **修复选项缩进逻辑**：确保 `{options}` 变量替换时，所有选项行都应用模板定义的缩进
- **统一自定义选项格式**：确保"自定义输入"选项（`{suffix}` 部分）与 `{options}` 部分格式一致

## Capabilities

### New Capabilities

无（这是 bug 修复，不新增功能）

### Modified Capabilities

- `install-config-registration`：修复插件路径解析验收场景（现有 spec 假设相对路径会工作，但实际未工作）
- `question-template-configuration`：修复选项缩进验收场景（现有 spec 要求所有选项行应用相同缩进，但实际只有第一行正确）

## Impact

- **代码影响**：`src/postinstall.ts`（路径解析）、`src/events/question-mapper.ts`（选项格式）
- **配置影响**：用户可以使用相对路径注册插件，无需修改现有配置
- **向后兼容**：修复不影响已使用绝对路径的用户，完全向后兼容
