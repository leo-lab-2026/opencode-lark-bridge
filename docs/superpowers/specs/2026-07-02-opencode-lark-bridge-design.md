---
comet_change: opencode-lark-bridge
role: technical-design
canonical_spec: openspec
---

# opencode-lark-bridge 技术设计

## 1. 设计目标

开发一个 OpenCode 本地插件，监听 `permission.asked` 事件，在权限请求发生时通过 Lark CLI 向指定飞书用户或群聊发送通知，使用户离开 OpenCode 环境也能及时感知。

## 2. 模块结构

```
packages/opencode-lark-bridge/
├── src/
│   ├── index.ts                 # 插件入口：组装各层并注册 OpenCode 钩子
│   ├── config.ts                # JSONC 配置加载、校验与类型定义
│   ├── types.ts                 # 共享类型：Notifier 接口、消息体、事件上下文
│   ├── logger.ts                # 文件日志实现
│   ├── notifier/
│   │   └── lark-notifier.ts     # 通过 lark-cli 发送消息
│   └── events/
│       ├── event-handler.ts     # 事件路由与去重
│       └── permission-mapper.ts # permission.asked → 消息体
├── tests/
│   ├── config.test.ts
│   ├── logger.test.ts
│   ├── lark-notifier.test.ts
│   ├── event-handler.test.ts
│   └── integration.test.ts
├── dist/                        # TypeScript 编译输出
├── logs/                        # 运行日志（默认，被 .gitignore 排除）
├── opencode-lark-bridge.config.jsonc
├── opencode-lark-bridge.config.example.jsonc
├── package.json
├── tsconfig.json
└── README.md
```

## 3. 数据流

```
OpenCode permission.asked 事件
        │
        ▼
┌─────────────────┐
│  EventHandler   │ ──► 按 category 查找配置，执行毫秒级去重
│                 │
└────────┬────────┘
         ▼
┌─────────────────┐
│ PermissionMapper│ ──► 提取 tool / operation / resource
└────────┬────────┘
         ▼
┌─────────────────┐
│ TemplateEngine  │ ──► 按类别模板渲染变量
└────────┬────────┘
         ▼
┌─────────────────┐
│  LarkNotifier   │ ──► 构建并异步执行 lark-cli 命令
└─────────────────┘
         │
         ▼
    lark-cli im +messages-send
```

## 4. 核心类型

```typescript
interface Notifier {
  send(message: NotificationMessage): Promise<void>
}

interface NotificationMessage {
  text: string
  target: { chat_id?: string; user_id?: string }
}

interface PluginConfig {
  app_id: string
  app_secret: string
  default_target: { chat_id?: string; user_id?: string }
  debounce_ms: number
  log_file: string
  categories: Record<string, CategoryConfig>
}

interface CategoryConfig {
  target?: { chat_id?: string; user_id?: string }
  template?: string
}
```

## 5. 关键设计决策

| 决策 | 选择 | 理由 |
| ---- | ---- | ---- |
| 源码目录 | `packages/opencode-lark-bridge/` | 与项目根目录隔离，支持清晰构建与项目级安装 |
| 配置文件位置 | 插件目录内 `opencode-lark-bridge.config.jsonc` | 插件自包含，与 `opencode.json` 解耦 |
| 发送方式 | `lark-cli im +messages-send` 子进程 | 复用 Lark CLI 认证，避免在插件内管理令牌 |
| 发送身份 | bot | 用户指定 |
| 消息格式 | 纯文本 | 兼容性最好，首版够用；卡片后续可作为模板选项 |
| 去重窗口 | 毫秒为单位，默认 3000ms | 支持小窗口，应对子代理同时申请权限 |
| 日志 | 写入文件，不输出终端 | 保持 OpenCode 终端整洁，便于排查 |
| 开发语言 | TypeScript | 类型安全，与 `@opencode-ai/plugin` 类型集成 |

## 6. 错误处理

- 配置缺失/无效：记录 warning 到日志文件，禁用通知，不抛异常。
- Lark CLI 不可用/未认证：记录 warning，跳过发送。
- Lark CLI 执行失败：记录 error，不阻塞 OpenCode 主流程。
- 日志文件不可写：静默降级，避免影响主流程。
- 模板变量缺失：保留占位符或回退为空字符串。

## 7. 去重策略

以 `category:resource` 为键维护最近通知时间戳。收到事件时，若当前时间与该键上次通知时间的差值小于 `debounce_ms`，则跳过。资源无法识别时使用 `category:tool` 作为键。

## 8. 测试策略

- **单元测试**：config、logger、lark-notifier、event-handler、permission-mapper 各自独立测试，依赖使用 mock。
- **集成测试**：配置加载 → 事件处理 → 命令构造的端到端流程，使用 mock 子进程验证生成的 lark-cli 命令。
- **开发者端到端测试**：按测试手册执行真实 Lark CLI + OpenCode 权限请求，验证消息内容、目标与日志。

## 9. 项目级安装

```bash
npm run build              # 编译 src/ 到 dist/
npm run install:local      # 复制 dist/ 到 .opencode/plugins/opencode-lark-bridge/
```

安装脚本仅覆盖 `.opencode/plugins/opencode-lark-bridge/` 目录，不修改 `opencode.json`。

## 10. 敏感信息保护

- `opencode-lark-bridge.config.jsonc` 与 `logs/` 加入 `.gitignore`。
- 提供 `opencode-lark-bridge.config.example.jsonc` 作为无密钥示例。
- 测试用凭证仅在本地配置文件中使用，不提交到仓库。
