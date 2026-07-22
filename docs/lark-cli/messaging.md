# Lark CLI 消息功能详解

> **文档类型**: 技术参考  
> **阅读时间**: 约 20 分钟  
> **目标读者**: 后端开发者、AI Agent 开发者

---

## 1. 消息系统概述

### 1.1 资源架构

Lark 消息系统围绕以下核心资源构建：

```
┌────────────────────────────────────────────────────────────────┐
│                      Lark 消息资源架构                           │
├────────────────────────────────────────────────────────────────┤
│  Message (消息)                                                │
│  ├─ 文本、富文本、图片、视频、音频、文件、表情包                  │
│  ├─ 消息卡片（富文本 + 交互组件）                                │
│  └─ 群名片、个人名片                                            │
├────────────────────────────────────────────────────────────────┤
│  Chat (群聊)                                                   │
│  ├─ 普通群组、话题群                                            │
│  ├─ 成员管理（用户、机器人）                                    │
│  └─ 群公告                                                     │
├────────────────────────────────────────────────────────────────┤
│  Thread (话题)                                                 │
│  └─ 话题内消息串                                               │
├────────────────────────────────────────────────────────────────┤
│  Reaction (表情回复)                                           │
│  └─ 对消息的 emoji 回应                                        │
└────────────────────────────────────────────────────────────────┘
```

### 1.2 消息类型支持

| 类型       | msg_type      | 说明                 | 典型场景      |
| -------- | ------------- | ------------------ | --------- |
| **文本**   | `text`        | 纯文本内容              | 简单通知、提醒   |
| **富文本**  | `post`        | 带格式的文本，支持 Markdown | 结构化信息展示   |
| **消息卡片** | `interactive` | 富文本+图片+交互组件        | 审批卡片、任务卡片 |
| **图片**   | `image`       | JPEG/PNG/WEBP      | 截图、图表分享   |
| **文件**   | `file`        | 任意文件类型             | 文档、压缩包传输  |
| **视频**   | `media`       | 视频文件               | 演示视频      |
| **音频**   | `audio`       | 语音消息               | 语音留言      |
| **表情包**  | `sticker`     | 系统表情包              | 快速反馈      |
| **群名片**  | `share_chat`  | 群组分享卡片             | 快捷加群      |
| **个人名片** | `share_user`  | 用户分享卡片             | 联系人推荐     |

---

## 2. 消息操作 API 详解

### 2.1 发送消息

**API 端点**: `POST /open-apis/im/v1/messages`

**核心参数**:

| 参数                | 类型     | 必填  | 说明                                                          |
| ----------------- | ------ | --- | ----------------------------------------------------------- |
| `receive_id_type` | string | 是   | 接收者 ID 类型: `open_id`/`user_id`/`union_id`/`email`/`chat_id` |
| `receive_id`      | string | 是   | 接收者 ID                                                      |
| `msg_type`        | string | 是   | 消息类型: `text`/`post`/`image`/`file`/`interactive`/...        |
| `content`         | string | 是   | 消息内容（JSON 序列化后的字符串）                                         |
| `uuid`            | string | 否   | 幂等键，1 小时内相同 uuid 只发送一次                                      |

**文本消息示例**:

```json
{
  "receive_id": "ou_7d8a6e6df7621556ce0d21922b676706ccs",
  "msg_type": "text",
  "content": "{\"text\":\"Hello, World!\"}",
  "uuid": "a0d69e20-1dd1-458b-k525-dfeca4015204"
}
```

**使用 CLI 发送**:

```bash
# 方式 1: 使用快捷命令（推荐）
lark-cli im +messages-send --chat-id "oc_xxx" --text "Hello, World!"

# 方式 2: 发送 Markdown
lark-cli im +messages-send --chat-id "oc_xxx" --markdown "## 更新\n\n- 功能 1\n- 功能 2"

# 方式 3: 使用 API 命令
lark-cli im messages create \
  --params '{"receive_id_type":"chat_id"}' \
  --data '{"receive_id":"oc_xxx","msg_type":"text","content":"{\\"text\\":\\"Hello\\"}"}'
```

### 2.2 回复消息

**API 端点**: `POST /open-apis/im/v1/messages/:message_id/reply`

**核心参数**:

| 参数                | 类型      | 必填  | 说明            |
| ----------------- | ------- | --- | ------------- |
| `message_id`      | string  | 是   | 要回复的消息 ID     |
| `content`         | string  | 是   | 消息内容（JSON 格式） |
| `msg_type`        | string  | 是   | 消息类型          |
| `reply_in_thread` | boolean | 否   | 是否以话题形式回复     |
| `uuid`            | string  | 否   | 幂等键           |

**使用 CLI 回复**:

```bash
# 回复文本消息
lark-cli im +messages-reply --message-id "om_xxx" --text "收到"

# 在话题中回复
lark-cli im +messages-reply --message-id "om_xxx" --text "我来处理" --reply-in-thread
```

### 2.3 获取消息列表（聊天记录）

**API 端点**: `GET /open-apis/im/v1/messages`

**核心参数**:

| 参数                  | 类型     | 必填  | 说明                                       |
| ------------------- | ------ | --- | ---------------------------------------- |
| `container_id_type` | string | 是   | 容器类型: `chat`（聊天）/`thread`（话题）            |
| `container_id`      | string | 是   | 容器 ID（chat_id 或 thread_id）               |
| `start_time`        | string | 否   | 开始时间戳（秒）                                 |
| `end_time`          | string | 否   | 结束时间戳（秒）                                 |
| `sort_type`         | string | 否   | 排序: `ByCreateTimeAsc`/`ByCreateTimeDesc` |
| `page_size`         | int    | 否   | 每页数量（1-50，默认 20）                         |
| `page_token`        | string | 否   | 分页标记                                     |

**使用 CLI 获取**:

```bash
# 获取群聊消息
lark-cli im +chat-messages-list --chat-id "oc_xxx"

# 获取话题消息
lark-cli im +threads-messages-list --thread-id "omt_xxx"

# 搜索消息
lark-cli im +messages-search --query "关键词"
```

### 2.4 撤回消息

**API 端点**: `DELETE /open-apis/im/v1/messages/:message_id`

**说明**:

- 机器人只能撤回自己发送的消息
- 群主可以撤回群内任何消息

**使用 CLI 撤回**:

```bash
lark-cli im messages delete --params '{"message_id":"om_xxx"}'
```

---

## 3. 消息卡片详解

### 3.1 什么是消息卡片

消息卡片是一种包含**富文本、图片和交互组件**的消息类型，可以实现：

- 精美的图文混排通知
- 可交互的表单和按钮
- 动态更新的内容展示
- 一键完成的业务操作

### 3.2 卡片结构

```json
{
  "config": {
    "wide_screen_mode": true    // 是否宽屏模式
  },
  "header": {
    "title": {
      "tag": "plain_text",
      "content": "卡片标题"
    },
    "template": "blue"           // 标题颜色: blue/red/green/orange
  },
  "elements": [
    // 卡片内容元素数组
  ]
}
```

### 3.3 常用元素类型

| 元素       | tag                | 说明                |
| -------- | ------------------ | ----------------- |
| **文本**   | `div`              | 普通文本块，支持 Markdown |
| **分栏**   | `div` + `is_short` | 两栏布局              |
| **分割线**  | `hr`               | 水平分割线             |
| **图片**   | `img`              | 图片展示              |
| **按钮**   | `button`           | 交互按钮              |
| **输入框**  | `input`            | 表单输入              |
| **选择器**  | `select_static`    | 下拉选择              |
| **日期选择** | `date_picker`      | 日期选择器             |
| **动作组**  | `action`           | 按钮容器              |

### 3.4 卡片示例：审批通知

```json
{
  "config": {
    "wide_screen_mode": true
  },
  "header": {
    "title": {
      "tag": "plain_text",
      "content": "⏳ 审批请求"
    },
    "template": "orange"
  },
  "elements": [
    {
      "tag": "div",
      "fields": [
        {
          "is_short": true,
          "text": {
            "tag": "lark_md",
            "content": "**申请人**\n张三"
          }
        },
        {
          "is_short": true,
          "text": {
            "tag": "lark_md",
            "content": "**类型**\n请假"
          }
        },
        {
          "is_short": false,
          "text": {
            "tag": "lark_md",
            "content": "**时间**\n2026-06-20 至 2026-06-22（3天）"
          }
        }
      ]
    },
    {
      "tag": "hr"
    },
    {
      "tag": "action",
      "layout": "bisected",
      "actions": [
        {
          "tag": "button",
          "text": {
            "tag": "plain_text",
            "content": "同意"
          },
          "type": "primary",
          "value": {
            "action": "approve",
            "request_id": "req_xxx"
          }
        },
        {
          "tag": "button",
          "text": {
            "tag": "plain_text",
            "content": "拒绝"
          },
          "type": "danger",
          "value": {
            "action": "reject",
            "request_id": "req_xxx"
          }
        }
      ]
    }
  ]
}
```

**使用 CLI 发送卡片**:

```bash
# 方式 1: 直接发送 JSON（推荐用于程序）
lark-cli im +messages-send \
  --chat-id "oc_xxx" \
  --msg-type interactive \
  --content '{"config":{"wide_screen_mode":true},"header":{...},"elements":[...]}'

# 方式 2: 使用 API 命令
lark-cli im messages create \
  --params '{"receive_id_type":"chat_id"}' \
  --data '{"receive_id":"oc_xxx","msg_type":"interactive","content":"..."}'
```

### 3.5 卡片更新

已发送的卡片支持更新内容：

**API 端点**: `PATCH /open-apis/im/v1/messages/:message_id`

```bash
lark-cli im messages patch \
  --params '{"message_id":"om_xxx"}' \
  --data '{"content":"{...更新后的卡片JSON...}"}'
```

---

## 4. 媒体资源操作

### 4.1 图片上传与发送

**上传图片**:

```bash
# 上传本地图片
lark-cli im images create --file ./photo.png

# 响应返回 image_key，用于发送
```

**发送图片消息**:

```bash
# 方式 1: 自动上传并发送
lark-cli im +messages-send --chat-id "oc_xxx" --image ./photo.png

# 方式 2: 使用已上传的 image_key
lark-cli im +messages-send --chat-id "oc_xxx" --image "img_xxx"
```

**图片要求**:

- 格式: JPEG、PNG、WEBP
- 大小: 不超过 20MB

### 4.2 文件上传与发送

**上传文件**:

```bash
# 上传本地文件
lark-cli im files create --file ./report.pdf

# 响应返回 file_key，用于发送
```

**发送文件消息**:

```bash
# 方式 1: 自动上传并发送
lark-cli im +messages-send --chat-id "oc_xxx" --file ./report.pdf

# 方式 2: 使用已上传的 file_key
lark-cli im +messages-send --chat-id "oc_xxx" --file "file_xxx"
```

**文件要求**:

- 大小: 不超过 200MB
- 类型: 无限制

### 4.3 视频发送

```bash
# 发送视频（需要封面）
lark-cli im +messages-send \
  --chat-id "oc_xxx" \
  --video ./demo.mp4 \
  --video-cover ./cover.png
```

### 4.4 下载资源

```bash
# 从消息中下载资源
lark-cli im +messages-resources-download \
  --message-id "om_xxx" \
  --output ./downloads/
```

---

## 5. 群组管理

### 5.1 创建群组

```bash
# 创建普通群组
lark-cli im +chat-create --name "项目讨论组" --description "用于项目讨论"

# 创建公开群组
lark-cli im +chat-create --name "公告群" --chat-mode "public"
```

### 5.2 搜索群组

```bash
# 按关键词搜索
lark-cli im +chat-search --query "项目"

# 按成员搜索
lark-cli im +chat-search --member-ids "ou_xxx,ou_yyy"
```

### 5.3 更新群组信息

```bash
lark-cli im +chat-update --chat-id "oc_xxx" --name "新名称"
```

### 5.4 群成员管理

```bash
# 添加成员
lark-cli im chat-members create \
  --params '{"chat_id":"oc_xxx"}' \
  --data '{"member_ids":["ou_xxx","ou_yyy"]}'

# 移除成员
lark-cli im chat-members delete \
  --params '{"chat_id":"oc_xxx","member_id":"ou_xxx"}'

# 获取成员列表
lark-cli im chat-members list --params '{"chat_id":"oc_xxx"}'
```

---

## 6. 事件订阅

### 6.1 接收消息事件

**事件类型**: `im.message.receive_v1`

**触发条件**: 当机器人收到用户消息时触发

**事件体结构**:

```json
{
  "schema": "2.0",
  "header": {
    "event_id": "5e3702a84e847582be8db7fb73283c02",
    "event_type": "im.message.receive_v1",
    "create_time": "1608725989000",
    "token": "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV",
    "app_id": "cli_9f5343c580712544",
    "tenant_key": "2ca1d211f64f6438"
  },
  "event": {
    "sender": {
      "sender_id": {
        "union_id": "on_8ed6aa67826108097d9ee143816345",
        "user_id": "e33ggbyz",
        "open_id": "ou_84aad35d084aa403a838cf73ee18467"
      },
      "sender_type": "user",
      "tenant_key": "736588c9260f175e"
    },
    "message": {
      "message_id": "om_5ce6d572455d361153b7cb51da133945",
      "root_id": "om_5ce6d572455d361153b7cb5xxfsdfsdfdsf",
      "parent_id": "om_5ce6d572455d361153b7cb5xxfsdfsdfdsf",
      "create_time": "1609073151345",
      "chat_id": "oc_5ce6d572455d361153b7xx51da133945",
      "thread_id": "omt_d4be107c616",
      "chat_type": "group",
      "message_type": "text",
      "content": "{\"text\":\"@_user_1 hello\"}",
      "mentions": [...]
    }
  }
}
```

**使用 CLI 监听事件**:

```bash
# 启动事件监听
lark-cli event consume im.message.receive_v1
```

### 6.2 其他重要事件

| 事件类型                             | 触发时机      |
| -------------------------------- | --------- |
| `im.message.message_read_v1`     | 用户已读消息    |
| `im.message.reaction.created_v1` | 添加表情回复    |
| `im.message.reaction.deleted_v1` | 删除表情回复    |
| `im.chat.member.bot.added_v1`    | 机器人被添加到群聊 |
| `im.chat.member.bot.deleted_v1`  | 机器人被移出群聊  |

---

## 7. 表情回复

### 7.1 添加表情

```bash
lark-cli im message-reactions create \
  --params '{"message_id":"om_xxx"}' \
  --data '{"reaction_type":"OK"}'
```

### 7.2 获取表情列表

```bash
lark-cli im message-reactions list --params '{"message_id":"om_xxx"}'
```

### 7.3 删除表情

```bash
lark-cli im message-reactions delete \
  --params '{"message_id":"om_xxx","reaction_id":"react_xxx"}'
```

---

## 8. 最佳实践

### 8.1 消息频率限制

| 限制类型    | 限制值          | 说明           |
| ------- | ------------ | ------------ |
| 单用户 QPS | 5            | 向同一用户发送消息的频率 |
| 单群 QPS  | 5            | 群内所有机器人共享    |
| API 总频率 | 1000/分钟、50/秒 | 全局限制         |

### 8.2 幂等性控制

使用 `uuid` 参数确保消息不重复发送：

```bash
lark-cli im +messages-send \
  --chat-id "oc_xxx" \
  --text "重要通知" \
  --idempotency-key "unique-request-id"
```

### 8.3 错误处理

常见错误码及处理建议：

| 错误码    | 含义         | 处理建议             |
| ------ | ---------- | ---------------- |
| 230002 | 机器人不在群聊中   | 先邀请机器人入群         |
| 230006 | 机器人能力未启用   | 在开发者后台添加机器人功能    |
| 230013 | 机器人对该用户不可用 | 检查应用可用范围         |
| 230020 | 频率限制       | 降低发送频率           |
| 230022 | 消息含敏感信息    | 检查消息内容           |
| 230025 | 消息内容过长     | 文本≤150KB，卡片≤30KB |
| 230027 | 权限不足       | 申请所需 scope       |

### 8.4 安全建议

1. **最小权限原则**: 只申请必要的 scope
2. **输入验证**: 对用户输入进行校验和转义
3. **敏感信息**: 避免在消息中暴露明文手机号、邮箱
4. **日志脱敏**: 日志中不记录敏感信息

---

## 9. 相关资源

- [消息卡片构建工具](https://open.larksuite.com/tool/cardbuilder)
- [API Explorer](https://open.larksuite.com/api-explorer)
- [消息 API 文档](https://open.larksuite.com/document/server-docs/im-v1/introduction)
- [消息卡片文档](https://open.larksuite.com/document/ukTMukTMukTM/uczM3QjL3MzN04yNzcDN)
- [错误码参考](https://open.larksuite.com/document/ukTMukTMukTM/ugjM14COyUjL4ITN)

---

**下一步**: 查看 [OpenCode 集成方案](integration.md) 了解如何将消息功能集成到 OpenCode 中。
