# Lark CLI 与 OpenCode 集成方案

> **文档类型**: 实施方案  
> **阅读时间**: 约 25 分钟  
> **目标读者**: OpenCode 插件开发者、DevOps 工程师

---

## 1. 集成目标

将 **Lark CLI** 作为 **OpenCode 的通知工具和控制工具**，实现：

- 📢 **通知能力**: 构建完成、任务状态、异常告警等实时推送
- 🎮 **控制能力**: 通过 Lark 消息触发 OpenCode 操作、查询状态
- 💬 **交互能力**: 双向通信，支持确认、审批、反馈等交互

---

## 2. 集成架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         OpenCode + Lark CLI 集成架构                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────┐        HTTP/WebSocket         ┌──────────────────┐  │
│   │   OpenCode   │ ◄────────────────────────────► │    Lark CLI      │  │
│   │   Platform   │                                │   (via lark-im)  │  │
│   └──────┬───────┘                                └────────┬─────────┘  │
│          │                                                │            │
│          │  Events/Notifications                         │  Messages  │
│          │                                                │            │
│   ┌──────▼───────┐                                ┌────────▼─────────┐  │
│   │   Plugin     │                                │   Feishu/Lark    │  │
│   │   System     │                                │   Messenger      │  │
│   │              │                                │                  │  │
│   │ ┌──────────┐ │                                │ ┌──────────────┐ │  │
│   │ │Notification│ │                               │ │   User Chat  │ │  │
│   │ │  Plugin   │ │                                │ │   Group Chat │ │  │
│   │ └──────────┘ │                                │ └──────────────┘ │  │
│   │              │                                │                  │  │
│   │ ┌──────────┐ │                                └──────────────────┘  │
│   │ │  Control │ │                                                      │
│   │ │  Plugin  │ │                                                      │
│   │ └──────────┘ │                                                      │
│   └──────────────┘                                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 通知方案（单向推送）

### 3.1 方案概述

**适用场景**: 构建完成、任务完成、异常告警、定时报告等

**实现方式**: OpenCode 在特定事件发生时，调用 Lark CLI 发送消息

### 3.2 基础通知类

```typescript
// lark-notifier.ts
import { execSync } from 'child_process';

interface LarkNotifierConfig {
  chatId?: string;
  userId?: string;
  as?: 'user' | 'bot';
}

interface NotificationOptions {
  title: string;
  content: string;
  level?: 'info' | 'success' | 'warning' | 'error';
  metadata?: Record<string, string>;
}

class LarkNotifier {
  private config: LarkNotifierConfig;

  constructor(config: LarkNotifierConfig) {
    this.config = {
      as: 'bot',
      ...config
    };
  }

  /**
   * 发送文本通知
   */
  async sendText(options: NotificationOptions): Promise<void> {
    const { title, content, level = 'info' } = options;

    const emoji = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    }[level];

    const text = `${emoji} **${title}**\n\n${content}`;

    const cmd = this.buildCommand('--text', text);
    this.execute(cmd);
  }

  /**
   * 发送卡片通知（推荐）
   */
  async sendCard(options: NotificationOptions): Promise<void> {
    const { title, content, level = 'info', metadata = {} } = options;

    const template = {
      info: 'blue',
      success: 'green',
      warning: 'orange',
      error: 'red'
    }[level];

    const card = {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: title },
        template
      },
      elements: [
        {
          tag: 'div',
          text: { tag: 'lark_md', content }
        },
        ...(Object.keys(metadata).length > 0 ? [
          { tag: 'hr' },
          {
            tag: 'div',
            fields: Object.entries(metadata).map(([key, value]) => ({
              is_short: true,
              text: { tag: 'lark_md', content: `**${key}**\n${value}` }
            }))
          }
        ] : [])
      ]
    };

    const cmd = this.buildCommand('--msg-type', 'interactive', '--content', JSON.stringify(card));
    this.execute(cmd);
  }

  private buildCommand(...args: string[]): string {
    const base = 'lark-cli im +messages-send';
    const identity = `--as ${this.config.as}`;
    const target = this.config.chatId 
      ? `--chat-id ${this.config.chatId}` 
      : `--user-id ${this.config.userId}`;

    return [base, identity, target, ...args.map(arg => `"${arg}"`)].join(' ');
  }

  private execute(cmd: string): void {
    try {
      execSync(cmd, { stdio: 'pipe' });
    } catch (error) {
      console.error('Failed to send Lark notification:', error);
      throw error;
    }
  }
}

export { LarkNotifier };
```

### 3.3 使用示例

```typescript
// 初始化通知器
const notifier = new LarkNotifier({
  chatId: 'oc_xxxxxxxxxx',  // 群聊 ID
  as: 'bot'                 // 以机器人身份发送
});

// 场景 1: 构建完成通知
await notifier.sendCard({
  title: '✅ 构建成功',
  content: '项目构建已完成，所有测试通过',
  level: 'success',
  metadata: {
    '项目': 'my-project',
    '分支': 'feature/new-feature',
    '耗时': '3m 42s',
    '构建号': '#1234'
  }
});

// 场景 2: 异常告警
await notifier.sendCard({
  title: '❌ 构建失败',
  content: '单元测试未通过，请检查代码',
  level: 'error',
  metadata: {
    '项目': 'my-project',
    '分支': 'feature/new-feature',
    '失败测试': '3 个',
    '日志': '[查看详情](https://ci.example.com/logs/1234)'
  }
});

// 场景 3: 定时报告
await notifier.sendText({
  title: '每日构建报告',
  content: `今日构建统计：
• 成功：15 次
• 失败：2 次
• 成功率：88.2%`,
  level: 'info'
});
```

### 3.4 OpenCode Hook 集成

```typescript
// opencode-hooks.ts
import { LarkNotifier } from './lark-notifier';

const notifier = new LarkNotifier({
  chatId: process.env.LARK_CHAT_ID,
  as: 'bot'
});

export const hooks = {
  // 构建开始
  async onBuildStart(context: BuildContext) {
    await notifier.sendText({
      title: '🚀 构建开始',
      content: `项目 ${context.project} 开始构建...`,
      level: 'info'
    });
  },

  // 构建成功
  async onBuildSuccess(context: BuildContext) {
    await notifier.sendCard({
      title: '✅ 构建成功',
      content: '构建已完成并通过所有检查',
      level: 'success',
      metadata: {
        '项目': context.project,
        '分支': context.branch,
        '耗时': `${context.duration}s`,
        '版本': context.version
      }
    });
  },

  // 构建失败
  async onBuildFailure(context: BuildContext, error: Error) {
    await notifier.sendCard({
      title: '❌ 构建失败',
      content: error.message,
      level: 'error',
      metadata: {
        '项目': context.project,
        '分支': context.branch,
        '错误': error.name,
        '日志': `[查看日志](${context.logUrl})`
      }
    });
  },

  // 部署完成
  async onDeployComplete(context: DeployContext) {
    await notifier.sendCard({
      title: '📦 部署完成',
      content: `已部署到 ${context.environment} 环境`,
      level: 'success',
      metadata: {
        '环境': context.environment,
        '版本': context.version,
        'URL': context.appUrl
      }
    });
  }
};
```

---

## 4. 控制方案（双向交互）

### 4.1 方案概述

**适用场景**: 通过 Lark 消息控制 OpenCode 操作

**实现方式**: 

1. 使用 `lark-event` Skill 监听消息事件
2. 解析消息内容识别指令
3. 执行对应操作并回复结果

### 4.2 命令解析器

```typescript
// command-parser.ts

interface ParsedCommand {
  action: string;
  args: string[];
  options: Record<string, string>;
  raw: string;
}

class CommandParser {
  private prefix: string;

  constructor(prefix: string = '/opencode') {
    this.prefix = prefix;
  }

  /**
   * 解析消息文本
   */
  parse(text: string): ParsedCommand | null {
    // 去除 @提及
    const cleanText = text.replace(/@_user_\d+/g, '').trim();

    // 检查前缀
    if (!cleanText.startsWith(this.prefix)) {
      return null;
    }

    // 解析命令
    const parts = cleanText.slice(this.prefix.length).trim().split(/\s+/);
    const action = parts[0];
    const args: string[] = [];
    const options: Record<string, string> = {};

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith('--')) {
        const [key, value] = part.slice(2).split('=');
        options[key] = value || parts[++i] || 'true';
      } else {
        args.push(part);
      }
    }

    return { action, args, options, raw: cleanText };
  }
}

export { CommandParser, ParsedCommand };
```

### 4.3 控制器实现

```typescript
// opencode-controller.ts
import { execSync } from 'child_process';
import { CommandParser, ParsedCommand } from './command-parser';

interface ControllerConfig {
  workDir: string;
  allowedUsers?: string[];
}

class OpenCodeController {
  private parser: CommandParser;
  private config: ControllerConfig;

  constructor(config: ControllerConfig) {
    this.parser = new CommandParser();
    this.config = config;
  }

  /**
   * 处理收到的消息
   */
  async handleMessage(message: LarkMessage): Promise<string> {
    // 权限检查
    if (this.config.allowedUsers && 
        !this.config.allowedUsers.includes(message.sender.open_id)) {
      return '⚠️ 您没有权限执行此操作';
    }

    // 解析命令
    const command = this.parser.parse(message.content.text);
    if (!command) {
      return null; // 不是控制命令，忽略
    }

    // 执行命令
    try {
      const result = await this.execute(command, message);
      return result;
    } catch (error) {
      return `❌ 执行失败: ${error.message}`;
    }
  }

  /**
   * 执行具体命令
   */
  private async execute(cmd: ParsedCommand, message: LarkMessage): Promise<string> {
    switch (cmd.action) {
      case 'build':
        return this.handleBuild(cmd);
      case 'status':
        return this.handleStatus(cmd);
      case 'deploy':
        return this.handleDeploy(cmd);
      case 'logs':
        return this.handleLogs(cmd);
      case 'help':
        return this.handleHelp();
      default:
        return `❓ 未知命令: ${cmd.action}\n发送 "/opencode help" 查看可用命令`;
    }
  }

  private async handleBuild(cmd: ParsedCommand): Promise<string> {
    const project = cmd.args[0] || 'default';
    const branch = cmd.args[1] || 'main';

    // 异步执行构建，立即返回确认
    this.runAsync(`opencode build ${project} --branch ${branch}`);

    return `🚀 已启动构建:\n• 项目: ${project}\n• 分支: ${branch}\n构建进度将通过消息通知`;
  }

  private async handleStatus(cmd: ParsedCommand): Promise<string> {
    const output = execSync('opencode status --json', { 
      cwd: this.config.workDir,
      encoding: 'utf-8'
    });

    const status = JSON.parse(output);

    return `📊 OpenCode 状态:\n` +
           `• 活跃会话: ${status.activeSessions}\n` +
           `• 队列任务: ${status.queuedTasks}\n` +
           `• 运行中任务: ${status.runningTasks}`;
  }

  private async handleDeploy(cmd: ParsedCommand): Promise<string> {
    const environment = cmd.args[0];
    if (!environment) {
      return '❓ 请指定部署环境，例如: /opencode deploy production';
    }

    // 生产环境需要确认
    if (environment === 'production' && !cmd.options['force']) {
      return this.sendConfirmationCard(message, 'deploy', { environment });
    }

    this.runAsync(`opencode deploy ${environment}`);
    return `📦 已启动部署到 ${environment} 环境`;
  }

  private async handleLogs(cmd: ParsedCommand): Promise<string> {
    const lines = parseInt(cmd.options['lines'] || '50');
    const output = execSync(`opencode logs --tail ${lines}`, {
      cwd: this.config.workDir,
      encoding: 'utf-8'
    });

    return `📋 最近 ${lines} 行日志:\n\n\`\`\`\n${output}\n\`\`\``;
  }

  private handleHelp(): string {
    return `🤖 OpenCode 控制命令:\n\n` +
           `/opencode build <project> [branch] - 构建项目\n` +
           `/opencode status - 查看系统状态\n` +
           `/opencode deploy <environment> - 部署到指定环境\n` +
           `/opencode logs [--lines=N] - 查看日志\n` +
           `/opencode help - 显示此帮助`;
  }

  private runAsync(command: string): void {
    // 使用子进程异步执行，不阻塞
    const child = spawn('bash', ['-c', command], {
      cwd: this.config.workDir,
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
  }

  private sendConfirmationCard(message: LarkMessage, action: string, data: any): string {
    // 发送带确认按钮的卡片
    // 实际实现需要调用 Lark API 发送交互卡片
    return '⏳ 请确认操作...';
  }
}

export { OpenCodeController };
```

### 4.4 事件监听服务

```typescript
// event-listener.ts
import { spawn } from 'child_process';
import { OpenCodeController } from './opencode-controller';
import { LarkNotifier } from './lark-notifier';

class LarkEventListener {
  private controller: OpenCodeController;
  private notifier: LarkNotifier;

  constructor(controller: OpenCodeController, notifier: LarkNotifier) {
    this.controller = controller;
    this.notifier = notifier;
  }

  /**
   * 启动事件监听
   */
  start(): void {
    // 使用 lark-cli 监听消息事件
    const eventProcess = spawn('lark-cli', [
      'event', 'consume', 'im.message.receive_v1',
      '--format', 'json'
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // 处理事件流
    let buffer = '';
    eventProcess.stdout.on('data', (data) => {
      buffer += data.toString();

      // 处理 NDJSON 格式
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留不完整的最后一行

      for (const line of lines) {
        if (line.trim()) {
          this.handleEvent(line);
        }
      }
    });

    eventProcess.stderr.on('data', (data) => {
      console.error('Event listener error:', data.toString());
    });

    eventProcess.on('close', (code) => {
      console.log(`Event listener exited with code ${code}`);
      // 自动重启
      setTimeout(() => this.start(), 5000);
    });
  }

  private async handleEvent(eventJson: string): Promise<void> {
    try {
      const event = JSON.parse(eventJson);

      // 提取消息信息
      const message = {
        id: event.event.message.message_id,
        content: JSON.parse(event.event.message.content),
        sender: {
          open_id: event.event.sender.sender_id.open_id,
          name: event.event.sender.sender_id.name
        },
        chat_id: event.event.message.chat_id,
        chat_type: event.event.message.chat_type
      };

      // 处理消息
      const reply = await this.controller.handleMessage(message);

      if (reply) {
        // 发送回复
        await this.notifier.sendText({
          title: '',
          content: reply,
          level: 'info'
        });
      }
    } catch (error) {
      console.error('Failed to handle event:', error);
    }
  }
}

export { LarkEventListener };
```

---

## 5. 审批工作流方案

### 5.1 方案概述

**适用场景**: 生产环境部署、敏感操作等需要人工确认的场景

**流程**:

1. OpenCode 发起操作请求
2. 发送审批卡片到指定审批人
3. 审批人点击按钮确认/拒绝
4. OpenCode 根据结果执行或取消操作

### 5.2 审批卡片示例

```typescript
// approval-workflow.ts

interface ApprovalRequest {
  action: string;
  requester: string;
  details: Record<string, string>;
  approvers: string[];
  timeout?: number;
}

class ApprovalWorkflow {
  private pendingApprovals: Map<string, ApprovalRequest>;

  constructor() {
    this.pendingApprovals = new Map();
  }

  /**
   * 发起审批请求
   */
  async requestApproval(req: ApprovalRequest): Promise<string> {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 保存请求
    this.pendingApprovals.set(requestId, req);

    // 构建审批卡片
    const card = {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: '⏳ 操作审批请求' },
        template: 'orange'
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**申请人**: ${req.requester}\n**操作**: ${req.action}`
          }
        },
        { tag: 'hr' },
        {
          tag: 'div',
          fields: Object.entries(req.details).map(([key, value]) => ({
            is_short: true,
            text: { tag: 'lark_md', content: `**${key}**\n${value}` }
          }))
        },
        { tag: 'hr' },
        {
          tag: 'action',
          layout: 'bisected',
          actions: [
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '✅ 同意' },
              type: 'primary',
              value: { action: 'approve', requestId }
            },
            {
              tag: 'button',
              text: { tag: 'plain_text', content: '❌ 拒绝' },
              type: 'danger',
              value: { action: 'reject', requestId }
            }
          ]
        }
      ]
    };

    // 发送给所有审批人
    for (const approverId of req.approvers) {
      await this.sendCardToUser(approverId, card);
    }

    // 设置超时
    if (req.timeout) {
      setTimeout(() => this.handleTimeout(requestId), req.timeout);
    }

    return requestId;
  }

  /**
   * 处理审批回调
   */
  async handleCallback(requestId: string, approved: boolean, operator: string): Promise<void> {
    const req = this.pendingApprovals.get(requestId);
    if (!req) {
      throw new Error('Request not found or already processed');
    }

    // 移除待处理
    this.pendingApprovals.delete(requestId);

    if (approved) {
      // 执行操作
      await this.executeAction(req);

      // 通知结果
      await this.notifyResult(req, true, operator);
    } else {
      // 通知拒绝
      await this.notifyResult(req, false, operator);
    }
  }

  private async executeAction(req: ApprovalRequest): Promise<void> {
    // 实际执行操作的逻辑
    console.log(`Executing action: ${req.action}`);
  }

  private async notifyResult(req: ApprovalRequest, approved: boolean, operator: string): Promise<void> {
    const status = approved ? '✅ 已批准' : '❌ 已拒绝';
    const template = approved ? 'green' : 'red';

    const card = {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: status },
        template
      },
      elements: [
        {
          tag: 'div',
          text: {
            tag: 'lark_md',
            content: `**操作**: ${req.action}\n**审批人**: ${operator}`
          }
        }
      ]
    };

    // 通知申请人和审批人
    await this.sendCardToUser(req.requester, card);
  }

  private async handleTimeout(requestId: string): Promise<void> {
    if (this.pendingApprovals.has(requestId)) {
      this.pendingApprovals.delete(requestId);
      // 发送超时通知
    }
  }

  private async sendCardToUser(userId: string, card: any): Promise<void> {
    const cmd = `lark-cli im +messages-send --user-id ${userId} --as bot --msg-type interactive --content '${JSON.stringify(card)}'`;
    execSync(cmd);
  }
}

export { ApprovalWorkflow };
```

---

## 6. 配置文件示例

### 6.1 环境变量

```bash
# .env
# Lark 配置
LARK_APP_ID=cli_xxxxxxxxxx
LARK_APP_SECRET=xxxxxxxxxx
LARK_CHAT_ID=oc_xxxxxxxxxx
LARK_BOT_AS=user  # 或 bot

# OpenCode 配置
OPENCODE_WORK_DIR=/path/to/workspace
OPENCODE_ALLOWED_USERS=ou_xxx,ou_yyy

# 通知配置
NOTIFICATION_LEVEL=info  # debug, info, warning, error
NOTIFICATION_ON_SUCCESS=true
NOTIFICATION_ON_FAILURE=true
```

### 6.2 配置文件

```yaml
# lark-opencode.yaml
lark:
  app_id: ${LARK_APP_ID}
  app_secret: ${LARK_APP_SECRET}
  default_chat_id: ${LARK_CHAT_ID}
  bot_as: bot

notification:
  enabled: true
  levels:
    - info
    - success
    - warning
    - error
  events:
    build_start: true
    build_success: true
    build_failure: true
    deploy_start: true
    deploy_success: true
    deploy_failure: true

customize:
  templates:
    build_success:
      title: "✅ 构建成功"
      color: green
      fields:
        - project
        - branch
        - duration
        - commit
    build_failure:
      title: "❌ 构建失败"
      color: red
      fields:
        - project
        - branch
        - error
        - log_url

control:
  enabled: true
  prefix: /opencode
  allowed_users:
    - ou_xxxxxxxxxx
    - ou_yyyyyyyyyy
  commands:
    - build
    - status
    - deploy
    - logs
```

---

## 7. 部署与运维

### 7.1 服务启动脚本

```bash
#!/bin/bash
# start-opencode-lark-bridge.sh

echo "Starting OpenCode-Lark Bridge Service..."

# 检查依赖
if ! command -v lark-cli &> /dev/null; then
    echo "Error: lark-cli not found. Please install it first."
    exit 1
fi

# 检查登录状态
if ! lark-cli auth status &> /dev/null; then
    echo "Error: Not authenticated. Please run 'lark-cli auth login' first."
    exit 1
fi

# 加载环境变量
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | xargs)
fi

# 启动服务
node dist/index.js
```

### 7.2 Docker 部署

```dockerfile
# Dockerfile
FROM node:18-alpine

# 安装 lark-cli
RUN npm install -g @larksuite/cli

WORKDIR /app

# 复制依赖
COPY package*.json ./
RUN npm install

# 复制代码
COPY . .

# 构建
RUN npm run build

# 启动
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yaml
version: '3.8'

services:
  opencode-lark-bridge:
    build: .
    container_name: opencode-lark-bridge
    environment:
      - LARK_APP_ID=${LARK_APP_ID}
      - LARK_APP_SECRET=${LARK_APP_SECRET}
      - LARK_CHAT_ID=${LARK_CHAT_ID}
    volumes:
      - ./config:/app/config
      - ./logs:/app/logs
    restart: unless-stopped
```

### 7.3 监控与告警

```typescript
// monitoring.ts
class HealthMonitor {
  async checkLarkConnection(): Promise<boolean> {
    try {
      execSync('lark-cli auth status', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  async checkEventListener(): Promise<boolean> {
    // 检查事件监听进程是否存活
    // ...
  }

  async sendHealthReport(): Promise<void> {
    const healthy = await this.checkLarkConnection();

    if (!healthy) {
      // 发送告警通知
      await notifier.sendCard({
        title: '⚠️ 服务异常',
        content: 'Lark CLI 连接失败，请检查配置',
        level: 'error'
      });
    }
  }
}
```

---

## 8. 常见问题

### Q1: 如何获取 chat_id？

```bash
# 搜索群组
lark-cli im +chat-search --query "群组名称"

# 或者在群设置中查看
```

### Q2: 消息发送失败怎么办？

1. 检查认证状态: `lark-cli auth status`
2. 检查权限: `lark-cli auth check`
3. 查看错误码: 参考 [消息 API 错误码](https://open.larksuite.com/document/ukTMukTMukTM/ugjM14COyUjL4ITN)

### Q3: 如何限制只有特定用户可以使用控制命令？

在 `OpenCodeController` 中配置 `allowedUsers` 列表，只有列表中的用户才能执行命令。

### Q4: 事件监听断线怎么办？

实现自动重连机制，在连接断开时自动重启监听服务。

---

## 9. 相关文档

- [Lark CLI 概述](overview.md)
- [消息功能详解](messaging.md)
- [命令速查表](commands-cheatsheet.md)
- [Lark 开放平台文档](https://open.larksuite.com/document/home/index)

---

**下一步**: 查看 [命令速查表](commands-cheatsheet.md) 获取常用命令的快速参考。
