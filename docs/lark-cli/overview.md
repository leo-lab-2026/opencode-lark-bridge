# Lark CLI 概述

> **文档类型**: 概念指南  
> **阅读时间**: 约 15 分钟  
> **目标读者**: 架构师、技术负责人、开发者

---

## 1. 什么是 Lark CLI

**Lark CLI** 是飞书（Lark/Feishu）官方推出的命令行工具，专为**人类用户**和 **AI Agent** 设计，让 AI 能够直接操作飞书的业务对象。

### 核心定位

```
AI 擅长推理，但缺少工具就无法在 Lark 中采取行动。
Lark CLI 连接 AI 与飞书，让 AI 能够：
✅ 检查日历
✅ 读取消息
✅ 创建文档
✅ 跟进任务
```

### 关键数据

- **200+** 命令，覆盖 18 大业务域
- **26+** AI Agent Skills，即开即用
- **MIT** 开源协议，零门槛使用
- **2500+** API 通过 Raw API 调用全覆盖

---

## 2. 为什么选 Lark CLI

| 特性                  | 说明                                       |
| ------------------- | ---------------------------------------- |
| **Agent-Native 设计** | 26 个 Skills 开箱即用，兼容主流 AI 工具，Agent 无需额外适配 |
| **覆盖面广**            | 18 大业务域、200+ 精选命令                        |
| **AI 友好调优**         | 每条命令经过 Agent 实测，提供智能默认值和结构化输出            |
| **开源零门槛**           | MIT 协议，`npm install` 即可使用                |
| **三分钟上手**           | 一键创建应用、交互式授权，三步完成首次 API 调用               |
| **安全可控**            | 输入防注入、终端输出净化、OS 原生密钥链存储凭证                |
| **三层调用架构**          | 快捷命令 → API 命令 → Raw API，按需选择粒度           |

---

## 3. 三层命令架构

Lark CLI 提供三种粒度的调用方式，覆盖从快速操作到完全自定义的全部场景。

```
┌─────────────────────────────────────────────────────────────────┐
│                    Lark CLI 三层命令架构                          │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: Shortcuts (快捷命令)                                   │
│  ├─ 前缀: +                                                      │
│  ├─ 特点: 人机友好、智能默认值、表格输出、dry-run 预览             │
│  └─ 示例: lark-cli im +messages-send --chat-id oc_xxx --text "Hi"│
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: API Commands (API 命令)                                │
│  ├─ 来源: 从飞书 OAPI 元数据自动生成                             │
│  ├─ 数量: 100+ 精选命令                                          │
│  └─ 示例: lark-cli calendar events instance_view --params '{}'   │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: Raw API (通用 API 调用)                                │
│  ├─ 覆盖: 2500+ 飞书开放平台端点                                 │
│  └─ 示例: lark-cli api POST /open-apis/im/v1/messages --data '{}'│
└─────────────────────────────────────────────────────────────────┘
```

### 使用建议

| 场景          | 推荐层级    | 原因             |
| ----------- | ------- | -------------- |
| 快速操作、AI 调用  | Layer 1 | 简单、智能默认值高      |
| 精确控制、特定 API | Layer 2 | 与平台 API 1:1 映射 |
| 未封装的 API    | Layer 3 | 全覆盖、最大灵活度      |

---

## 4. AI Agent Skills 体系

### Skill 是什么

**Skill** 是 Lark CLI 为 AI Agent 封装的高层级能力单元，每个 Skill 对应一个业务域的核心操作。

### Skill 列表

| Skill                           | 中文名     | 功能描述                                 |
| ------------------------------- | ------- | ------------------------------------ |
| `lark-shared`                   | 共享基础    | 应用配置、认证登录、身份切换、权限管理（所有 Skill 自动加载）   |
| `lark-im`                       | 即时通讯    | 发送/回复消息、群聊管理、消息搜索、上传下载图片与文件          |
| `lark-doc`                      | 云文档     | 创建、读取、更新、搜索文档（基于 Markdown）           |
| `lark-drive`                    | 云空间     | 上传、下载文件，管理权限与评论                      |
| `lark-base`                     | 多维表格    | 表、字段、记录、视图、仪表盘、数据聚合分析                |
| `lark-sheets`                   | 电子表格    | 创建、读取、写入、追加、查找、导出表格                  |
| `lark-calendar`                 | 日历      | 日程管理、忙闲查询、时间建议、会议室查找                 |
| `lark-task`                     | 任务      | 任务、任务清单、子任务、提醒、成员分配                  |
| `lark-mail`                     | 邮箱      | 浏览、搜索、阅读邮件，发送、回复、转发、草稿管理             |
| `lark-contact`                  | 通讯录     | 按姓名/邮箱/手机号搜索用户，获取用户信息                |
| `lark-wiki`                     | 知识库     | 知识空间、节点、文档管理                         |
| `lark-event`                    | 事件订阅    | 实时事件订阅（WebSocket），支持正则路由与 Agent 友好格式 |
| `lark-vc`                       | 视频会议    | 搜索会议记录、查询会议纪要产物                      |
| `lark-whiteboard`               | 画板      | 画板/图表 DSL 渲染                         |
| `lark-minutes`                  | 妙记      | 妙记元数据与 AI 产物、上传音视频生成妙记               |
| `lark-approval`                 | 审批      | 审批任务查询、同意/拒绝/转交审批任务                  |
| `lark-attendance`               | 考勤      | 查询个人考勤打卡记录                           |
| `lark-okr`                      | OKR     | 查询、创建、更新 OKR，管理目标、关键结果               |
| `lark-workflow-meeting-summary` | 会议摘要工作流 | 会议纪要汇总与结构化报告                         |
| `lark-workflow-standup-report`  | 日程摘要工作流 | 日程待办摘要                               |

---

## 5. 身份与权限体系

### 双重身份

Lark CLI 支持以两种身份执行命令：

| 身份                     | 说明          | 使用场景          |
| ---------------------- | ----------- | ------------- |
| **用户身份** (`--as user`) | 以授权用户的身份操作  | 访问个人日历、消息、文档  |
| **机器人身份** (`--as bot`) | 以应用机器人的身份操作 | 发送通知、自动回复、群管理 |

### 身份切换示例

```bash
# 以用户身份查看日程
lark-cli calendar +agenda --as user

# 以机器人身份发送消息
lark-cli im +messages-send --as bot --chat-id "oc_xxx" --text "Hello"
```

### 权限 Scope

每个操作需要特定的权限 Scope，可通过 `lark-cli auth login` 授权：

```bash
# 交互式登录（TUI 引导选择）
lark-cli auth login

# 按业务域筛选
lark-cli auth login --domain calendar,task

# 推荐的自动审批 scopes
lark-cli auth login --recommend

# 精确 scope
lark-cli auth login --scope "im:message:send_as_bot"
```

---

## 6. 输出格式与进阶功能

### 输出格式

```bash
--format json      # 完整 JSON 响应（默认）
--format pretty    # 人性化格式输出
--format table     # 易读表格
--format ndjson    # 换行分隔 JSON（适合管道处理）
--format csv       # 逗号分隔值
```

### 分页控制

```bash
--page-all         # 自动翻页获取所有数据
--page-limit 5     # 最多获取 5 页
--page-delay 500   # 每页请求间隔 500ms
```

### Dry Run（预览）

```bash
# 预览请求，不实际执行
lark-cli im +messages-send --chat-id oc_xxx --text "hello" --dry-run
```

### Schema 自省

```bash
# 查看 API 方法的参数、请求体、响应结构
lark-cli schema im.messages.create
lark-cli schema calendar.events.instance_view
```

---

## 7. 集成模式

### 模式一：凭证层（一键应用创建）

**目标**: 快速获取 App ID 和 App Secret

**流程**:

1. 用户扫描二维码或点击链接
2. 创建应用或选择已有应用
3. 自动配置权限和事件订阅
4. 获取凭证，立即可用

### 模式二：交互层（Channel SDK）

**目标**: 在 Lark 中与 Agent 实时对话

**能力**:

- 收发消息（单聊、群聊、文档评论）
- 流式回复
- 卡片交互
- 媒体上传

**支持语言**: Node.js、Python、Java、Go

### 模式三：执行层（Lark CLI）

**目标**: 让 Agent 直接操作 Lark 业务对象

**典型场景**:

- 读取日历，自动安排会议
- 创建文档，整理会议纪要
- 查询消息，提取待办事项
- 发送通知，报告任务进度

---

## 8. 安全与风险

⚠️ **重要提示**

| 风险    | 说明               | 缓解措施      |
| ----- | ---------------- | --------- |
| 模型幻觉  | AI 可能误解指令或产生错误操作 | 敏感操作加人工确认 |
| 执行不可控 | AI 行为可能超出预期      | 设置最小权限原则  |
| 提示词注入 | 恶意输入可能操控 AI      | 输入防注入保护   |
| 数据泄露  | 敏感数据可能被误发        | 终端输出净化    |

**最佳实践**:

- 将对接 CLI 的机器人作为私人对话助手使用
- 不要将其拉入群聊或允许其他用户交互
- 不要主动修改默认安全配置
- 使用系统钥匙链存储凭证

---

## 9. 相关链接

| 资源          | 链接                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------- |
| GitHub 仓库   | https://github.com/larksuite/cli                                                                           |
| 官方文档        | https://open.larksuite.com/document/home/index                                                             |
| MCP 集成概述    | https://open.larksuite.com/document/mcp_open_tools/overview-of-lark-agent-integration-capabilities         |
| CLI 介绍      | https://open.larksuite.com/document/mcp_open_tools/feishu-cli-let-ai-actually-do-your-work-in-feishu       |
| 消息 API      | https://open.larksuite.com/document/server-docs/im-v1/introduction                                         |
| Channel SDK | https://open.larksuite.com/document/mcp_open_tools/integrating-agents-with-feishu/integrate-feishu-channel |

---

## 10. 下一步

- 📖 深入了解 [消息功能](messaging.md)
- 🔧 查看 [OpenCode 集成方案](integration.md)
- 📋 查阅 [命令速查表](commands-cheatsheet.md)
