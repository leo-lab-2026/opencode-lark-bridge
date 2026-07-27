# 模板配置指南

本文档详细说明 opencode-lark-bridge 插件的模板配置功能，帮助您自定义飞书通知格式。

## 目录

- [模板配置概述](#模板配置概述)
- [可用模板字段](#可用模板字段)
- [模板变量说明](#模板变量说明)
- [配置示例](#配置示例)
- [最佳实践](#最佳实践)
- [注意事项](#注意事项)

---

## 模板配置概述

### 什么是模板配置？

模板配置允许您自定义飞书通知的文本格式，通过模板变量动态填充内容，实现个性化的通知样式。

### 配置文件位置

配置文件按以下顺序查找，命中即返回：

1. `<project>/.opencode/opencode-lark-bridge.config.jsonc`（项目级配置）
2. `~/.config/opencode/opencode-lark-bridge.config.jsonc`（全局配置）

### 配置格式

配置文件使用 JSONC 格式（支持注释的 JSON），模板字段位于 `categories.<category>.template` 路径下。

---

## 可用模板字段

### 1. `template` - 单问题模板

**适用场景**：单问题通知或作为多问题的默认模板

**位置**：`categories.question.template`

**示例**：
```jsonc
"template": "❓ OpenCode Question\nProject: {projectName}\nHeader: {header}\n{question}\nOptions:\n{options}"
```

### 2. `template_multiple` - 多问题整体框架模板

**适用场景**：多问题通知的整体框架

**位置**：`categories.question.template_multiple`

**示例**：
```jsonc
"template_multiple": "❓ OpenCode Question\nProject: {projectName}\nHeader: {header}\n\n{questions}"
```

**说明**：
- `{questions}` 会被所有问题项的渲染结果替换
- 不配置时使用 `template` 字段

### 3. `question_item_template` - 问题项模板

**适用场景**：多问题中每个问题项的格式

**位置**：`categories.question.question_item_template`

**示例**：
```jsonc
"question_item_template": "{number}. {header}\n   {question}\n   Options:\n   {options}\n   {suffix}"
```

**说明**：
- 需配合 `template_multiple` 使用
- 用于控制每个问题项的具体格式

---

## 模板变量说明

### 通用变量

| 变量 | 说明 | 可用场景 |
|------|------|---------|
| `{projectName}` | 项目名称 | 所有通知类型 |
| `{header}` | 标题 | 问题通知 |

### 单问题变量

| 变量 | 说明 | 特性 |
|------|------|------|
| `{question}` | 问题文本 | 自动截断（200 字符） |
| `{options}` | 选项列表 | **自动缩进**：模板中 `{options}` 前的缩进会应用到每个选项行 |
| `{suffix}` | 选择方式说明 | 如 `(可多选)`、`(可自定义输入)` |

**示例**：
```
模板：Options:\n   {options}
结果：Options:
      • 选项1: 描述1
      • 选项2: 描述2
```

### 多问题变量

| 变量 | 说明 | 可用字段 |
|------|------|---------|
| `{questions}` | 所有问题项拼接文本 | `template_multiple` |

### 问题项变量

| 变量 | 说明 | 可用字段 |
|------|------|---------|
| `{number}` | 问题序号（1, 2, 3...） | `question_item_template` |
| `{header}` | 问题标题 | `question_item_template` |
| `{question}` | 问题文本 | `question_item_template` |
| `{options}` | 选项列表 | `question_item_template` |
| `{suffix}` | 选择方式说明 | `question_item_template` |

---

## 配置示例

### 示例 1：默认配置（不自定义模板）

```jsonc
{
  "categories": {
    "question": {
      // 不配置 template/template_multiple/question_item_template
      // 使用插件默认模板
    }
  }
}
```

**效果**：使用改进后的默认模板，Options 单独一行，层次清晰。

### 示例 2：自定义单问题模板

```jsonc
{
  "categories": {
    "question": {
      "template": "🔍 问题通知\n项目: {projectName}\n问题: {question}\n选项:\n{options}\n提示: {suffix}"
    }
  }
}
```

### 示例 3：自定义多问题模板

```jsonc
{
  "categories": {
    "question": {
      "template_multiple": "📋 多问题通知\n项目: {projectName}\n共 {header}\n\n{questions}",
      "question_item_template": "问题 {number}: {header}\n   内容: {question}\n   选择:\n   {options}\n   {suffix}"
    }
  }
}
```

**生成效果**：
```
📋 多问题通知
项目: my-project
共 Multiple Questions (2)

问题 1: 确认操作
   内容: 是否继续？
   选择:
   • 确认: 继续执行
   • 取消: 取消操作
   (可多选)

问题 2: 输入备注
   内容: 请输入备注信息
   选择:
   (可自定义输入)
```

### 示例 4：组合配置

```jsonc
{
  "categories": {
    "question": {
      // 单问题模板
      "template": "❓ Question\nProject: {projectName}\n{question}\nOptions:\n{options}\n{suffix}",
      
      // 多问题整体框架
      "template_multiple": "❓ Questions ({header})\nProject: {projectName}\n\n{questions}",
      
      // 问题项格式
      "question_item_template": "{number}. {header}\n   Q: {question}\n   Choices:\n   {options}\n   {suffix}"
    }
  }
}
```

---

## 最佳实践

### 1. 保持模板简洁清晰

**推荐**：
```jsonc
"template": "❓ Question\nProject: {projectName}\n{question}\nOptions:\n{options}"
```

**不推荐**：
```jsonc
"template": "❓❓❓ 超级重要问题通知！！！\n=== 项目信息 ===\n项目名称：{projectName}\n=== 问题内容 ===\n问题：{question}\n=== 选项列表 ===\n选项：{options}"
```

### 2. 合理使用变量

- 只使用必要的变量
- 避免重复使用同一变量
- 注意变量大小写（必须完全匹配）

### 3. 测试不同场景

建议测试以下场景：
- ✅ 单问题 + 有选项
- ✅ 单问题 + 无选项（确认 suffix 显示）
- ✅ 多问题 + 部分无选项
- ✅ 选项截断（> 5 个选项）

---

## 注意事项

### 1. 配置优先级

**规则**：配置 > 默认

- 配置了 `template` → 使用配置值
- 未配置 → 使用默认硬编码值
- 只配置部分字段 → 未配置字段使用默认值

### 2. 选项自动缩进

**机制**：模板中 `{options}` 前的缩进会自动应用到每个选项行

**示例**：
```
模板：   {options}     （3 个空格缩进）
选项：• A: 描述\n• B: 描述
结果：• A: 描述
      • B: 描述     （第二行自动应用 3 空格缩进）
```

### 3. 空选项处理

当问题无选项时，模板中的 `Options:` 行会自动移除（避免空行）。

**特殊场景**：问题无选项但有 `custom: true` → 显示 `Options:\n   (可自定义输入)`

### 4. 选项截断

**规则**：最多显示 5 个选项，剩余显示 `... (N more)`

**示例**：
```
• 选项1: 描述1
• 选项2: 描述2
• 选项3: 描述3
• 选项4: 描述4
• 选项5: 描述5
... (3 more)        ← 剩余 3 个选项
```

### 5. 变量大小写

模板变量区分大小写，必须完全匹配：

- ✅ `{projectName}` 
- ❌ `{projectname}`
- ❌ `{ProjectName}`

### 6. JSONC 格式

配置文件支持 JSONC 格式：
- ✅ 支持单行注释 `// comment`
- ✅ 支持多行注释 `/* comment */`
- ✅ 支持尾随逗号

---

## 常见问题

### Q1: 如何恢复默认模板？

**A**: 删除或注释掉配置文件中的 `template`、`template_multiple`、`question_item_template` 字段。

### Q2: 多问题通知只显示一个模板？

**A**: 检查是否同时配置了 `template_multiple` 和 `question_item_template`，两者需配合使用。

### Q3: Options 没有换行？

**A**: 使用 `Options:\n{options}` 格式，而不是 `Options: {options}`。

---

## 相关文档

- [README.md](../README.md) - 插件总体说明
- [CONFIG_GUIDE.md](./CONFIG_GUIDE.md) - 完整配置指南
- [opencode-lark-bridge.config.example.jsonc](../opencode-lark-bridge.config.example.jsonc) - 配置示例

---

**更新日期**: 2026-07-27  
**版本**: 1.0.0
