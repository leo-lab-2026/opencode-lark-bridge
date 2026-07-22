# Lark CLI 命令速查表

> **文档类型**: 快速参考  
> **适用场景**: 日常开发、快速查阅  
> **建议**: 收藏备用

---

## 📋 目录

- [认证命令](#认证命令)
- [消息命令](#消息命令)
- [群组命令](#群组命令)
- [资源命令](#资源命令)
- [事件命令](#事件命令)
- [通用选项](#通用选项)
- [常用场景](#常用场景)

---

## 认证命令

### 登录与状态

| 命令                                            | 说明            | 示例                                                     |
| --------------------------------------------- | ------------- | ------------------------------------------------------ |
| `auth login`                                  | 交互式登录         | `lark-cli auth login`                                  |
| `auth login --recommend`                      | 使用推荐权限登录      | `lark-cli auth login --recommend`                      |
| `auth login --domain im,calendar`             | 按业务域筛选权限      | `lark-cli auth login --domain im`                      |
| `auth login --scope "im:message:send_as_bot"` | 精确指定 scope    | `lark-cli auth login --scope "im:message:send_as_bot"` |
| `auth login --no-wait`                        | Agent 模式（非阻塞） | `lark-cli auth login --no-wait`                        |
| `auth status`                                 | 查看登录状态        | `lark-cli auth status`                                 |
| `auth check`                                  | 检查当前权限        | `lark-cli auth check`                                  |
| `auth scopes`                                 | 列出所有可用 scope  | `lark-cli auth scopes`                                 |
| `auth logout`                                 | 登出            | `lark-cli auth logout`                                 |

### 应用配置

| 命令                  | 说明      | 示例                           |
| ------------------- | ------- | ---------------------------- |
| `config init`       | 初始化应用配置 | `lark-cli config init`       |
| `config init --new` | 创建新应用   | `lark-cli config init --new` |

---

## 消息命令

### 发送消息（Shortcuts）

| 命令                  | 说明          | 示例                                                           |
| ------------------- | ----------- | ------------------------------------------------------------ |
| `im +messages-send` | 发送消息        | `lark-cli im +messages-send --chat-id oc_xxx --text "Hello"` |
| `--text`            | 发送文本        | `--text "Hello World"`                                       |
| `--markdown`        | 发送 Markdown | `--markdown "## Title\n- item"`                              |
| `--image`           | 发送图片        | `--image ./photo.png` 或 `--image img_xxx`                    |
| `--file`            | 发送文件        | `--file ./report.pdf`                                        |
| `--video`           | 发送视频        | `--video ./demo.mp4 --video-cover ./cover.png`               |
| `--audio`           | 发送音频        | `--audio ./voice.opus`                                       |
| `--user-id`         | 发送到私聊       | `--user-id ou_xxx`                                           |
| `--chat-id`         | 发送到群聊       | `--chat-id oc_xxx`                                           |
| `--as bot/user`     | 指定身份        | `--as bot`                                                   |
| `--idempotency-key` | 幂等键         | `--idempotency-key "unique-id"`                              |
| `--dry-run`         | 预览请求        | `--dry-run`                                                  |

### 回复消息

| 命令                   | 说明     | 示例                                                            |
| -------------------- | ------ | ------------------------------------------------------------- |
| `im +messages-reply` | 回复消息   | `lark-cli im +messages-reply --message-id om_xxx --text "OK"` |
| `--reply-in-thread`  | 在话题中回复 | `--reply-in-thread`                                           |

### 消息查询

| 命令                          | 说明     | 示例                                                       |
| --------------------------- | ------ | -------------------------------------------------------- |
| `im +chat-messages-list`    | 获取群聊消息 | `lark-cli im +chat-messages-list --chat-id oc_xxx`       |
| `im +threads-messages-list` | 获取话题消息 | `lark-cli im +threads-messages-list --thread-id omt_xxx` |
| `im +messages-search`       | 搜索消息   | `lark-cli im +messages-search --query "关键词"`             |
| `im +messages-mget`         | 批量获取消息 | `lark-cli im +messages-mget --message-ids om_1,om_2`     |

### 消息管理（API Commands）

| 命令                   | 说明     | 示例                                                                                                                                                         |
| -------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `im messages create` | 发送消息   | `lark-cli im messages create --params '{"receive_id_type":"chat_id"}' --data '{"receive_id":"oc_xxx","msg_type":"text","content":"{\"text\":\"Hello\"}"}'` |
| `im messages reply`  | 回复消息   | `lark-cli im messages reply --params '{"message_id":"om_xxx"}' --data '{"content":"{\"text\":\"OK\"}","msg_type":"text"}'`                                 |
| `im messages list`   | 获取消息列表 | `lark-cli im messages list --params '{"container_id_type":"chat","container_id":"oc_xxx"}'`                                                                |
| `im messages delete` | 撤回消息   | `lark-cli im messages delete --params '{"message_id":"om_xxx"}'`                                                                                           |
| `im messages get`    | 获取单条消息 | `lark-cli im messages get --params '{"message_id":"om_xxx"}'`                                                                                              |
| `im messages patch`  | 更新消息卡片 | `lark-cli im messages patch --params '{"message_id":"om_xxx"}' --data '{"content":"{...}"}'`                                                               |

### 资源下载

| 命令                                | 说明     | 示例                                                                                   |
| --------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `im +messages-resources-download` | 下载消息资源 | `lark-cli im +messages-resources-download --message-id om_xxx --output ./downloads/` |

---

## 群组命令

### 群组管理

| 命令                       | 说明     | 示例                                                       |
| ------------------------ | ------ | -------------------------------------------------------- |
| `im +chat-create`        | 创建群组   | `lark-cli im +chat-create --name "项目组"`                  |
| `im +chat-search`        | 搜索群组   | `lark-cli im +chat-search --query "项目"`                  |
| `im +chat-update`        | 更新群组信息 | `lark-cli im +chat-update --chat-id oc_xxx --name "新名称"` |
| `im +chat-messages-list` | 获取群消息  | `lark-cli im +chat-messages-list --chat-id oc_xxx`       |

### 群成员管理

| 命令                       | 说明     | 示例                                                                                                   |
| ------------------------ | ------ | ---------------------------------------------------------------------------------------------------- |
| `im chat-members list`   | 获取成员列表 | `lark-cli im chat-members list --params '{"chat_id":"oc_xxx"}'`                                      |
| `im chat-members create` | 添加成员   | `lark-cli im chat-members create --params '{"chat_id":"oc_xxx"}' --data '{"member_ids":["ou_xxx"]}'` |
| `im chat-members delete` | 移除成员   | `lark-cli im chat-members delete --params '{"chat_id":"oc_xxx","member_id":"ou_xxx"}'`               |

---

## 资源命令

### 图片操作

| 命令                 | 说明   | 示例                                                          |
| ------------------ | ---- | ----------------------------------------------------------- |
| `im images create` | 上传图片 | `lark-cli im images create --file ./photo.png`              |
| `im images get`    | 下载图片 | `lark-cli im images get --params '{"image_key":"img_xxx"}'` |

### 文件操作

| 命令                | 说明   | 示例                                                         |
| ----------------- | ---- | ---------------------------------------------------------- |
| `im files create` | 上传文件 | `lark-cli im files create --file ./report.pdf`             |
| `im files get`    | 下载文件 | `lark-cli im files get --params '{"file_key":"file_xxx"}'` |

### 表情回复

| 命令                            | 说明     | 示例                                                                                                        |
| ----------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `im message-reactions list`   | 获取表情列表 | `lark-cli im message-reactions list --params '{"message_id":"om_xxx"}'`                                   |
| `im message-reactions create` | 添加表情   | `lark-cli im message-reactions create --params '{"message_id":"om_xxx"}' --data '{"reaction_type":"OK"}'` |
| `im message-reactions delete` | 删除表情   | `lark-cli im message-reactions delete --params '{"message_id":"om_xxx","reaction_id":"react_xxx"}'`       |

---

## 事件命令

### 事件监听

| 命令                            | 说明        | 示例                                                           |
| ----------------------------- | --------- | ------------------------------------------------------------ |
| `event consume`               | 监听事件      | `lark-cli event consume im.message.receive_v1`               |
| `event consume --format json` | JSON 格式输出 | `lark-cli event consume im.message.receive_v1 --format json` |

### 常用事件类型

| 事件类型                             | 说明      |
| -------------------------------- | ------- |
| `im.message.receive_v1`          | 收到消息    |
| `im.message.message_read_v1`     | 消息已读    |
| `im.message.reaction.created_v1` | 添加表情    |
| `im.message.reaction.deleted_v1` | 删除表情    |
| `im.chat.member.bot.added_v1`    | 机器人被加群  |
| `im.chat.member.bot.deleted_v1`  | 机器人被移出群 |

---

## 通用选项

### 全局选项

| 选项                                      | 说明       | 示例                                                |
| --------------------------------------- | -------- | ------------------------------------------------- |
| `--as user/bot`                         | 指定执行身份   | `lark-cli im +messages-send --as bot --text "Hi"` |
| `--format json/pretty/table/ndjson/csv` | 输出格式     | `--format table`                                  |
| `--page-all`                            | 自动翻页     | `--page-all`                                      |
| `--page-limit N`                        | 限制页数     | `--page-limit 5`                                  |
| `--page-delay N`                        | 分页延迟(ms) | `--page-delay 500`                                |
| `--dry-run`                             | 预览请求     | `--dry-run`                                       |
| `--help`                                | 查看帮助     | `lark-cli im +messages-send --help`               |

---

## 常用场景

### 场景 1: 发送文本通知

```bash
# 基础文本
lark-cli im +messages-send --chat-id "oc_xxx" --text "构建成功！"

# 多行文本
lark-cli im +messages-send --chat-id "oc_xxx" --text $'第一行\n第二行\n第三行'

# 使用 Markdown
lark-cli im +messages-send --chat-id "oc_xxx" --markdown $'## 更新日志\n\n- 修复了 bug\n- 优化了性能'
```

### 场景 2: 发送卡片通知

```bash
# 基础卡片
lark-cli im +messages-send \
  --chat-id "oc_xxx" \
  --msg-type interactive \
  --content '{
    "config": {"wide_screen_mode": true},
    "header": {
      "title": {"tag": "plain_text", "content": "✅ 构建成功"},
      "template": "green"
    },
    "elements": [
      {"tag": "div", "text": {"tag": "lark_md", "content": "项目构建已完成"}}
    ]
  }'
```

### 场景 3: 发送图片/文件

```bash
# 发送本地图片
lark-cli im +messages-send --chat-id "oc_xxx" --image ./screenshot.png

# 使用已上传的图片 key
lark-cli im +messages-send --chat-id "oc_xxx" --image "img_v3_xxx"

# 发送文件
lark-cli im +messages-send --chat-id "oc_xxx" --file ./report.pdf

# 发送视频
lark-cli im +messages-send --chat-id "oc_xxx" --video ./demo.mp4 --video-cover ./cover.png
```

### 场景 4: 获取聊天记录

```bash
# 获取最近消息
lark-cli im +chat-messages-list --chat-id "oc_xxx"

# 获取指定时间范围的消息
lark-cli im messages list \
  --params '{
    "container_id_type": "chat",
    "container_id": "oc_xxx",
    "start_time": "1608594809",
    "end_time": "1609296809"
  }'

# 搜索消息
lark-cli im +messages-search --query "关键词" --page-all
```

### 场景 5: 创建群组并发送消息

```bash
# 创建群组
lark-cli im +chat-create --name "项目通知群" --description "用于接收构建通知"

# 记录返回的 chat_id，然后发送消息
lark-cli im +messages-send --chat-id "oc_xxx" --text "群组创建成功！"
```

### 场景 6: 监听消息事件

```bash
# 启动消息监听
lark-cli event consume im.message.receive_v1

# JSON 格式输出（便于程序解析）
lark-cli event consume im.message.receive_v1 --format json
```

### 场景 7: 身份切换示例

```bash
# 以用户身份查看日程
lark-cli calendar +agenda --as user

# 以机器人身份发送消息
lark-cli im +messages-send --as bot --chat-id "oc_xxx" --text "Hello"
```

### 场景 8: Dry Run 调试

```bash
# 预览请求内容，不实际发送
lark-cli im +messages-send \
  --chat-id "oc_xxx" \
  --text "Test" \
  --dry-run

# 查看 API Schema
lark-cli schema im.messages.create
```

---

## 快捷命令索引

### im 模块 Shortcuts

| Shortcut                       | 功能      |
| ------------------------------ | ------- |
| `+chat-create`                 | 创建群组    |
| `+chat-messages-list`          | 获取群消息列表 |
| `+chat-search`                 | 搜索群组    |
| `+chat-update`                 | 更新群组信息  |
| `+messages-mget`               | 批量获取消息  |
| `+messages-reply`              | 回复消息    |
| `+messages-resources-download` | 下载消息资源  |
| `+messages-search`             | 搜索消息    |
| `+messages-send`               | 发送消息    |
| `+threads-messages-list`       | 获取话题消息  |

---

## 相关文档

- [Lark CLI 概述](overview.md)
- [消息功能详解](messaging.md)
- [OpenCode 集成方案](integration.md)
- [官方 API 文档](https://open.larksuite.com/document/server-docs/im-v1/introduction)

---

💡 **提示**: 使用 `lark-cli <command> --help` 查看具体命令的详细帮助。
