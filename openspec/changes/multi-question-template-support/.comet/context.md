# Comet Spec Context

- Change: multi-question-template-support
- Phase: design
- Mode: beta
- Context hash: b774de047709dabf3e9c3b3156cf61576324e5c7351eabfcff65488b17a8eeb0

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This beta context pack verbatim-projects spec files and references supporting artifacts by hash, not an agent-authored summary.

## Source References

- Source: openspec/changes/multi-question-template-support/proposal.md
- SHA256: 287b0ee3f1472211cbff1a054e4cbf9f74e2a326e3a45028e04bf856f1a0ff2a
- Source: openspec/changes/multi-question-template-support/design.md
- SHA256: f724a22dd72dee84dc074dd616f456e3c9fa9134e5f4ae25fda0c2450ddb2121
- Source: openspec/changes/multi-question-template-support/tasks.md
- SHA256: 41a5ca232994ab1f0bb37c3931438e849e6aa76668a9645d5b73337c09e27201
- Source: openspec/changes/multi-question-template-support/specs/question-template-configuration/spec.md
- SHA256: 4a9b3395b02bb11ebde6712bd95d5621d0f447d16102211c878ea3a549b75377

## Acceptance Projection

## openspec/changes/multi-question-template-support/specs/question-template-configuration/spec.md

- Source: openspec/changes/multi-question-template-support/specs/question-template-configuration/spec.md
- Lines: 1-121
- SHA256: 4a9b3395b02bb11ebde6712bd95d5621d0f447d16102211c878ea3a549b75377

```md
## ADDED Requirements

### Requirement: 支持多问题整体框架模板配置

系统应允许用户通过配置文件自定义多问题通知的整体框架模板。

#### Scenario: 配置多问题整体框架模板
- **WHEN** 用户在配置文件的 `categories.question.template_multiple` 字段中定义模板
- **THEN** 多问题通知使用该模板生成整体框架文本

#### Scenario: 未配置多问题模板时使用默认模板
- **WHEN** 用户未配置 `template_multiple` 字段
- **THEN** 多问题通知使用默认的硬编码模板 `DEFAULT_TEMPLATE_MULTIPLE`

#### Scenario: 模板变量替换
- **WHEN** 模板中包含 `{projectName}`、`{header}`、`{questions}` 变量
- **THEN** 这些变量被替换为实际的项目名、标题和所有问题项文本

### Requirement: 支持多问题中单个问题项模板配置

系统应允许用户通过配置文件自定义多问题中每个问题项的格式。

#### Scenario: 配置问题项模板
- **WHEN** 用户在配置文件的 `categories.question.question_item_template` 字段中定义模板
- **THEN** 每个问题项使用该模板生成文本

#### Scenario: 未配置问题项模板时使用默认模板
- **WHEN** 用户未配置 `question_item_template` 字段
- **THEN** 问题项使用默认的硬编码模板 `DEFAULT_QUESTION_ITEM_TEMPLATE`

#### Scenario: 问题项模板变量替换
- **WHEN** 模板中包含 `{number}`、`{header}`、`{question}`、`{options}`、`{suffix}` 变量
- **THEN** 这些变量被替换为实际的序号、问题标题、问题文本、选项列表和选择方式说明

### Requirement: 选项列表自动缩进

系统应自动应用模板中 `{options}` 变量前的缩进到每个选项行。

#### Scenario: 选项列表缩进处理
- **WHEN** 模板中 `{options}` 前有缩进（如 `   {options}` 表示 3 个空格）
- **THEN** 替换后的每个选项行都应用相同的缩进（第一行除外，因为已有模板缩进）

#### Scenario: 多行选项缩进示例
- **WHEN** 模板为 `Options:\n   {options}` 且选项为 `• 选项1: 描述\n• 选项2: 描述`
- **THEN** 替换结果为 `Options:\n   • 选项1: 描述\n   • 选项2: 描述`

### Requirement: 后缀变量自由定位

系统应允许用户通过 `{suffix}` 变量在模板中自由定位选择方式说明。

#### Scenario: 后缀变量替换
- **WHEN** 问题有 `multiple: true` 属性
- **THEN** `{suffix}` 被替换为 `(可多选)`

#### Scenario: 多个后缀组合
- **WHEN** 问题同时有 `multiple: true` 和 `custom: true` 属性
- **THEN** `{suffix}` 被替换为 `(可多选) (可自定义输入)`

#### Scenario: 无后缀时变量替换为空
- **WHEN** 问题无 `multiple` 和 `custom` 属性或均为 false
- **THEN** `{suffix}` 被替换为空字符串

#### Scenario: 后缀在模板中单独一行
- **WHEN** 用户在模板中配置 `{suffix}` 单独一行
- **THEN** 选择方式说明显示在单独一行

### Requirement: 配置优先级原则

所有 category 的所有模板字段都应遵循"配置 > 默认"优先级原则。

#### Scenario: 配置字段优先使用配置值
- **WHEN** 配置文件中存在模板字段（如 `template`、`template_multiple`、`question_item_template`）
- **THEN** 使用配置值而非默认硬编码值

#### Scenario: 未配置字段使用默认值
- **WHEN** 配置文件中不存在某个模板字段
- **THEN** 使用对应的默认硬编码值

#### Scenario: permission category 模板配置优先
- **WHEN** 用户配置了 `categories.permission.template`
- **THEN** 权限通知使用配置的模板而非默认模板

#### Scenario: error category 模板配置优先
- **WHEN** 用户配置了 `categories.error.template`
- **THEN** 错误通知使用配置的模板而非默认模板

#### Scenario: completion category 模板配置优先
- **WHEN** 用户配置了 `categories.completion.template`
- **THEN** 完成通知使用配置的模板而非默认模板

### Requirement: 默认模板提供清晰层次格式

系统应提供改进后的默认硬编码模板，确保层次清晰、格式正确。

#### Scenario: 默认单问题模板格式
- **WHEN** 用户未配置 `template` 字段
- **THEN** 单问题通知使用默认模板，Options 单独一行，选项对齐

#### Scenario: 默认多问题模板格式
- **WHEN** 用户未配置 `template_multiple` 和 `question_item_template` 字段
- **THEN** 多问题通知使用默认模板，每个问题项有清晰编号、缩进和段落分隔

#### Scenario: 默认模板解决 Options 对齐问题
- **WHEN** 使用默认模板
- **THEN** Options: 单独一行，后续选项行对齐显示

### Requirement: 向后兼容

系统应确保新增配置字段不破坏现有配置和代码。

#### Scenario: 现有配置继续工作
- **WHEN** 用户配置文件中只包含现有字段（如 `template`）
- **THEN** 插件正常工作，新字段使用默认值

#### Scenario: 空选项问题正确处理
- **WHEN** 问题无选项但有 `custom: true` 属性
- **THEN** 显示 `Options:\n   (可自定义输入)` 或根据模板配置显示

#### Scenario: 选项截断正确显示
- **WHEN** 问题选项超过 5 个
- **THEN** 显示前 5 个选项 + `... (N more)` 提示

```

Full source files remain canonical. If a required heading or scenario is missing here, regenerate the handoff or read the source spec directly. Supporting files (proposal, design, tasks) are referenced by hash only.