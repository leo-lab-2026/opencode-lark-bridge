# Lark CLI 使用指南

> **最后更新**: 2026-06-22  
> **版本**: v1.0  
> **适用对象**: OpenCode 开发者、AI Agent 集成

---

## 📚 文档导航

本知识库旨在为将 **Lark CLI** 作为 **OpenCode 通知工具和控制工具** 提供全面的参考资料。

| 文档 | 内容 | 适用场景 |
|------|------|----------|
| [📖 概述](overview.md) | Lark CLI 简介、核心概念、架构设计 | 初次了解、架构设计 |
| [💬 消息功能详解](messaging.md) | 消息类型、API 详情、最佳实践 | 消息功能开发、通知集成 |
| [🔧 OpenCode 集成方案](integration.md) | 通知方案、控制方案、代码示例 | OpenCode 插件开发 |
| [📋 命令速查表](commands-cheatsheet.md) | 常用命令、参数说明、示例 | 日常开发、快速查阅 |

---

## 🎯 快速开始

### 1. 安装 Lark CLI

```bash
# 使用 npm 安装（推荐）
npx @larksuite/cli@latest install

# 安装 CLI Skill（必需）
npx skills add larksuite/cli -y -g
```

### 2. 初始化配置

```bash
# 配置应用凭证
lark-cli config init

# 登录授权
lark-cli auth login --recommend

# 验证状态
lark-cli auth status
```

### 3. 发送第一条消息

```bash
# 发送文本消息
lark-cli im +messages-send --chat-id "oc_xxx" --text "Hello from OpenCode!"
```

---

## 🏗️ 架构概览

### Lark Agent 集成三层能力

```
┌─────────────────────────────────────────────────────────────────┐
│                    Lark Agent 集成能力栈                          │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: 执行层 (Lark CLI)                                      │
│  ├─ 操作 Lark 业务对象（文档、日历、表格等）                        │
│  ├─ 200+ 命令、26+ AI Agent Skills                              │
│  └─ 目标：让 Agent "Get Work Done"                              │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: 交互层 (Channel SDK)                                   │
│  ├─ 收发消息、群组对话、文档评论                                   │
│  ├─ 流式回复、卡片交互                                            │
│  └─ 目标：让 Agent "Listen" & "Speak"                           │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: 凭证层 (一键应用创建)                                   │
│  ├─ 快速获取 App ID / App Secret                                │
│  ├─ 自动配置权限和事件订阅                                        │
│  └─ 目标：Obtain usable Lark credentials instantly              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🌟 核心能力

### 18 大业务域覆盖

| 业务域 | 核心功能 | Skill 名称 |
|--------|----------|------------|
| 💬 **即时通讯** | 发送/回复消息、群聊管理、文件传输 | `lark-im` |
| 📄 **云文档** | 创建、读取、更新文档 | `lark-doc` |
| 📊 **多维表格** | 表、字段、记录、视图管理 | `lark-base` |
| 📅 **日历** | 日程管理、忙闲查询、会议室预定 | `lark-calendar` |
| 📧 **邮箱** | 收发邮件、草稿管理、规则设置 | `lark-mail` |
| ✅ **任务** | 任务创建、子任务、清单管理 | `lark-task` |
| 🎥 **视频会议** | 会议查询、纪要获取 | `lark-vc` |
| 📚 **知识库** | 空间、节点、文档管理 | `lark-wiki` |
| 🔗 **更多...** | 审批、考勤、OKR、幻灯片等 | ... |

---

## 🔐 安全须知

⚠️ **使用前必读**

- AI Agent 将在授权范围内以用户身份执行操作
- 存在模型幻觉、执行不可控、提示词注入等风险
- 建议仅作为私人对话助手使用
- 不要将机器人拉入群聊或允许其他用户交互
- 敏感操作建议加审批确认环节

---

## 📖 相关资源

- **GitHub**: https://github.com/larksuite/cli
- **官方文档**: https://open.larksuite.com/document/home/index
- **MCP 集成**: https://open.larksuite.com/document/mcp_open_tools/overview-of-lark-agent-integration-capabilities
- **消息 API**: https://open.larksuite.com/document/server-docs/im-v1/introduction
- **CLI 介绍**: https://open.larksuite.com/document/mcp_open_tools/feishu-cli-let-ai-actually-do-your-work-in-feishu

---

## 📝 更新日志

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2026-06-22 | v1.0 | 初始版本，整理基础知识和消息功能 |

---

**贡献指南**: 欢迎提交 PR 完善文档。如发现错误或有改进建议，请随时反馈。
