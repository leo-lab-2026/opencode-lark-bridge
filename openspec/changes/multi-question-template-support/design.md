## Context

opencode-lark-bridge 是一个 OpenCode 插件，负责将 OpenCode 的事件（权限申请、任务完成、问答等）通过 lark-cli 以 bot 身份推送到飞书用户或群聊。事件监听层与发送层通过 `Notifier` 接口解耦。

当前 question 事件的模板系统仅支持单一模板字段 `template`，适用于单问题场景。对于多问题（Multiple Questions）场景，代码中硬编码了格式逻辑，无法通过配置文件自定义。具体问题包括：

1. Options 对齐问题：`Options: • 选项1` 格式导致选项不对齐
2. 缺少多问题模板配置：无法自定义整体框架和问题项格式
3. 选项缩进不可控：`{options}` 替换时不保留模板中的缩进
4. 后缀位置固定：选择方式说明的位置不可自定义

**约束**：
- 保持向后兼容：不配置新字段时使用改进后的默认格式
- 遵循配置优先原则：所有模板字段都应优先使用配置值
- 不引入破坏性变更：现有配置和代码继续工作

**利益相关者**：
- 插件使用者：期望通过配置自定义通知格式
- 飞书通知接收者：期望清晰、层次分明的通知格式

## Goals / Non-Goals

**Goals:**
- 为 question category 新增 `template_multiple` 和 `question_item_template` 配置字段
- 实现 `{options}` 变量的自动缩进：模板中 `{options}` 前的缩进应用到每个选项行
- 提供 `{suffix}` 变量：允许用户在模板中自由定位选择方式说明
- 提供改进后的默认硬编码模板：层次清晰、格式正确
- 确保所有 category 的所有模板字段遵循"配置 > 默认"优先级

**Non-Goals:**
- 不改变 permission/error/completion 的模板机制（已遵循配置优先原则）
- 不修改 OpenCode 事件结构
- 不支持模板条件逻辑或循环
- 不引入新的外部依赖

## Decisions

### 决策 1：配置字段设计

**选择**：新增 `template_multiple` 和 `question_item_template` 两个独立字段

**理由**：
- 清晰的语义分离：整体框架 vs 单个问题项
- 向后兼容：不配置时使用默认值
- 灵活性：用户可以只配置其中部分字段

**替代方案**：
- 方案 A：嵌套对象 `templates: { single, multiple, questionItem }` — 过度设计，增加配置复杂度
- 方案 B：条件模板映射 — 增加代码复杂度，不符合"简单配置"原则

### 决策 2：选项缩进处理

**选择**：自动应用模板中 `{options}` 前的缩进到每个选项行

**理由**：
- 用户体验：用户只需在模板中写一次缩进，所有选项自动对齐
- 灵活性：支持任意缩进级别
- 一致性：与 `{suffix}` 等变量的处理方式一致

**实现方式**：
```typescript
function applyIndent(template: string, varName: string, content: string): string {
  const indentMatch = template.match(new RegExp(`([ \\t]*)\\{${varName}\\}`))
  const indent = indentMatch ? indentMatch[1] : ''
  const lines = content.split('\n')
  return lines.map((line, i) => i === 0 ? line : indent + line).join('\n')
}
```

### 决策 3：后缀变量位置

**选择**：将 `{suffix}` 作为独立变量，用户可在模板中自由定位

**理由**：
- 当前行为：suffix 追加到最后一个选项行末尾（不够灵活）
- 用户需求：可能希望单独一行或追加到末尾
- 灵活性：由模板决定位置，不硬编码

**默认行为**：默认模板中将 `{suffix}` 放在单独一行，保持层次清晰

### 决策 4：默认模板改进

**选择**：提供层次清晰的默认硬编码模板

**理由**：
- 解决当前的 Options 对齐问题
- 提供良好的开箱即用体验
- 向后兼容：不配置时自动使用改进后的格式

**默认模板**：
```typescript
// 单问题
const DEFAULT_TEMPLATE = "❓ OpenCode Question\nProject: {projectName}\nHeader: {header}\n{question}\nOptions:\n{options}\n{suffix}"

// 多问题整体框架
const DEFAULT_TEMPLATE_MULTIPLE = "❓ OpenCode Question\nProject: {projectName}\nHeader: {header}\n\n{questions}"

// 问题项
const DEFAULT_QUESTION_ITEM_TEMPLATE = "{number}. {header}\n   {question}\n   Options:\n   {options}\n   {suffix}"
```

### 决策 5：配置优先级原则

**选择**：所有 category 的所有模板字段都遵循"配置 > 默认"优先级

**理由**：
- 一致性：避免不同 category 行为不一致
- 用户预期：配置了就应该生效
- 当前代码已实现：permission/error/completion 已遵循此原则

**实现方式**：
```typescript
const effectiveTemplate = config.template || DEFAULT_TEMPLATE
const effectiveTemplateMultiple = config.template_multiple || DEFAULT_TEMPLATE_MULTIPLE
const effectiveQuestionItemTemplate = config.question_item_template || DEFAULT_QUESTION_ITEM_TEMPLATE
```

## Risks / Trade-offs

**风险 1：模板变量拼错**
- **风险**：用户在配置中写错变量名（如 `{option}` 而非 `{options}`），导致变量不被替换
- **缓解**：在文档中提供清晰的变量列表和示例；可考虑在日志中警告未替换的 `{...}` 模式

**风险 2：空选项问题**
- **风险**：问题无选项但模板中有 `Options:\n{options}` 行，导致出现空行或孤立的 "Options:"
- **缓解**：复用当前代码中的 Options 行移除逻辑（已实现，针对单问题场景）；多问题场景在问题项模板中处理

**风险 3：配置文件格式错误**
- **风险**：JSONC 解析失败或字段类型错误
- **缓解**：使用 comment-json 解析器（已在 config.ts 中使用）；添加类型检查和错误提示

**权衡 1：灵活性 vs 复杂度**
- **权衡**：提供更多模板字段增加了灵活性，但也增加了配置复杂度
- **决策**：选择两个独立字段（`template_multiple`、`question_item_template`），在灵活性和复杂度之间取得平衡

**权衡 2：自动缩进 vs 手动控制**
- **权衡**：自动应用缩进简化了配置，但也限制了用户的完全控制权
- **决策**：选择自动缩进，因为绝大多数场景都希望选项对齐；用户仍可通过模板中的缩进控制位置
