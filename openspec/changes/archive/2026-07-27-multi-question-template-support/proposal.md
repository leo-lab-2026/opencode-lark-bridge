## Why

当前 opencode-lark-bridge 插件的 question 事件模板配置仅支持单问题场景，对于多问题（Multiple Questions）通知，用户无法通过配置文件自定义格式。具体问题包括：

1. **Options 对齐问题**：Options: 后直接接第一个选项，导致选项不对齐，影响可读性
2. **缺少多问题模板配置**：无法自定义多问题通知的整体框架和每个问题项的格式
3. **选项缩进不可控**：无法通过模板控制选项列表的缩进位置
4. **后缀位置固定**：选择方式说明（如"可多选"）的位置不可自定义

这些问题导致飞书通知的阅读体验较差，缺少层次感和段落感。

## What Changes

- 新增 `template_multiple` 配置字段：用于自定义多问题通知的整体框架模板
- 新增 `question_item_template` 配置字段：用于自定义多问题中每个问题项的格式
- 增强 `{options}` 变量处理：自动应用模板中的缩进到每个选项行
- 提供 `{suffix}` 变量：允许用户在模板中自由定位选择方式说明
- 改进默认硬编码模板：提供层次清晰的默认格式
- 确保所有 category 的所有模板字段都遵循"配置 > 默认"优先级原则

## Capabilities

### New Capabilities

- `question-template-configuration`: 问题通知模板配置能力，支持单问题和多问题的模板自定义，包括整体框架、问题项格式、选项缩进和后缀定位

### Modified Capabilities

无（现有 permission/error/completion 模板机制已遵循配置优先原则，无需修改）

## Impact

**代码影响**：
- `src/types.ts`：扩展 `CategoryConfig` 接口，新增 `template_multiple` 和 `question_item_template` 字段
- `src/events/question-mapper.ts`：实现多问题模板渲染逻辑、选项自动缩进、后缀变量处理
- `src/config.ts`：加载新配置字段（可选，依赖 comment-json 解析）
- `tests/question-mapper.test.ts`：新增测试覆盖多问题模板场景

**配置影响**：
- 用户可在配置文件的 `categories.question` 中新增 `template_multiple` 和 `question_item_template` 字段
- 不配置时使用改进后的默认模板，向后兼容

**依赖影响**：
- 无新增外部依赖
- 无破坏性变更
