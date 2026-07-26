# OpenCode Lark Bridge — E2E 事件触发测试提示词

> 用法：将此文件完整内容作为 System Prompt 或 User Prompt 提供给被测模型（OpenCode / 任意 Agent）。模型按步骤执行操作时会自然触发 `permission.asked`、`question.asked`、`session.idle` 等事件，供 lark-bridge 插件接收并转发到飞书，从而完成端到端验证。
> 
> **注意：所有文件操作均限制在项目内的 `tests/fixtures/my-node-app/` 测试目录，不触碰系统文件。**

---

## 角色设定

你是一个全栈开发助手，正在协助用户完成一个 **Node.js 项目的部署流程**。

当前项目目录（已预置测试夹具）：
```
/home/lifxu/src/opencode-lark-bridge/tests/fixtures/my-node-app/
├── .env.production          # 生产环境配置
├── nginx-error.log          # 模拟的 nginx 错误日志
├── package.json             # 项目元数据
└── README.md                # 部署文档
```

用户指令：
1. 先查看项目内的模拟日志确认无异常
2. 读取项目配置确认构建参数
3. 读取本地部署文档作为参考
4. 让用户选择部署环境
5. 询问数据库和缓存配置
6. 完成部署

**你必须严格按以下 6 个步骤顺序执行，每个步骤都会触发系统级权限或问答事件。**

---

## Step 1 — 权限申请：Read（查看日志）

读取项目内的模拟日志文件：

```
/home/lifxu/src/opencode-lark-bridge/tests/fixtures/my-node-app/nginx-error.log
```

**预期触发事件：**
```json
{
  "type": "permission.asked",
  "properties": {
    "tool": "read",
    "args": { "filePath": "/home/lifxu/src/opencode-lark-bridge/tests/fixtures/my-node-app/nginx-error.log" }
  }
}
```

---

## Step 2 — 权限申请：Read（读取配置）

读取项目内的生产环境配置：

```
/home/lifxu/src/opencode-lark-bridge/tests/fixtures/my-node-app/.env.production
```

**预期触发事件：**
```json
{
  "type": "permission.asked",
  "properties": {
    "tool": "read",
    "args": { "filePath": "/home/lifxu/src/opencode-lark-bridge/tests/fixtures/my-node-app/.env.production" }
  }
}
```

---

## Step 3 — 权限申请：Read（读取部署文档）

读取项目内的部署说明文档：

```
/home/lifxu/src/opencode-lark-bridge/tests/fixtures/my-node-app/README.md
```

**预期触发事件：**
```json
{
  "type": "permission.asked",
  "properties": {
    "tool": "read",
    "args": { "filePath": "/home/lifxu/src/opencode-lark-bridge/tests/fixtures/my-node-app/README.md" }
  }
}
```

---

## Step 4 — 问答选择：单问题（部署环境）

询问用户部署目标环境，提供 3 个选项：

| label | description |
|---|---|
| test | 测试环境（自动部署，无需审批） |
| staging | 预发环境（需代码审查通过） |
| production | 生产环境（需额外确认） |

**预期触发事件：**
```json
{
  "type": "question.asked",
  "properties": {
    "id": "deploy-env-001",
    "projectName": "my-node-app",
    "questions": [
      {
        "question": "请选择要部署的目标环境",
        "header": "部署环境选择",
        "options": [
          { "label": "test", "description": "测试环境（自动部署，无需审批）" },
          { "label": "staging", "description": "预发环境（需代码审查通过）" },
          { "label": "production", "description": "生产环境（需额外确认）" }
        ],
        "multiple": false,
        "custom": true
      }
    ]
  }
}
```

---

## Step 5 — 问答选择：多问题（配置参数）

连续向用户询问两个配置问题：

### 问题 5a — 数据库类型
| label | description |
|---|---|
| mysql | MySQL 8.0 |
| postgres | PostgreSQL 15 |
| mongodb | MongoDB 7.0 |

### 问题 5b — 缓存策略
| label | description |
|---|---|
| enabled | 启用 Redis 缓存 |
| disabled | 不启用缓存 |

**预期触发事件：**
```json
{
  "type": "question.asked",
  "properties": {
    "id": "db-cache-001",
    "projectName": "my-node-app",
    "questions": [
      {
        "question": "请选择数据库类型",
        "header": "数据库配置",
        "options": [
          { "label": "mysql", "description": "MySQL 8.0" },
          { "label": "postgres", "description": "PostgreSQL 15" },
          { "label": "mongodb", "description": "MongoDB 7.0" }
        ],
        "multiple": false,
        "custom": false
      },
      {
        "question": "是否启用 Redis 缓存？",
        "header": "缓存策略",
        "options": [
          { "label": "enabled", "description": "启用 Redis 缓存" },
          { "label": "disabled", "description": "不启用缓存" }
        ],
        "multiple": false,
        "custom": false
      }
    ]
  }
}
```

---

## Step 6 — 任务完成

所有步骤执行完毕，标记当前会话为 idle 状态。

**预期触发事件：**
```json
{
  "type": "session.idle",
  "properties": {
    "sessionID": "ses_main_001",
    "projectName": "my-node-app",
    "sessionTitle": "Node.js deployment"
  }
}
```

---

## 测试验证清单

| 步骤 | 事件类型 | 飞书通知应包含 |
|---|---|---|
| 1 | `permission.asked` | `Tool: read` / `Target: ...nginx-error.log` |
| 2 | `permission.asked` | `Tool: read` / `Target: .../.env.production` |
| 3 | `permission.asked` | `Tool: read` / `Target: .../README.md` |
| 4 | `question.asked` | `Project: my-node-app` / `Header: 部署环境选择` / `test/staging/production` |
| 5 | `question.asked` | `Multiple Questions (2)` / `数据库配置` / `缓存策略` |
| 6 | `session.idle` | `✅ Task Completed` / `Project: my-node-app` / `Session: Node.js deployment` |

---

## 执行约束

- **必须按 1→6 顺序执行**，不可跳过或重排
- **每一步只触发一次**对应事件，Step 4/5 的 `id` 字段用于去重验证
- **事件属性必须完整**，特别是 `properties.tool`、`properties.args`、`properties.questions`
- **文件路径必须使用项目内测试目录**，禁止访问 `/var/log/`、`/etc/` 等系统路径
- **如果权限被拒绝**，应记录原因并继续下一步（不要终止流程）
