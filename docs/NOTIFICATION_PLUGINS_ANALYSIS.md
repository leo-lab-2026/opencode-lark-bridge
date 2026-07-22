# OpenCode 通知插件项目分析报告

> 分析三个 OpenCode 通知插件项目，总结架构、技术选型和共通点

---

## 目录

1. [项目概览](#项目概览)
2. [项目一：opencode-notify (kdcokenny)](#项目一opencode-notify-kdcokenny)
3. [项目二：opencode-notificator (panta82)](#项目二opencode-notificator-panta82)
4. [项目三：opencode-notifier (mohak34)](#项目三opencode-notifier-mohak34)
5. [技术对比总结](#技术对比总结)
6. [共通点提炼](#共通点提炼)
7. [最佳实践指南](#最佳实践指南)
8. [开发参考代码](#开发参考代码)

---

## 项目概览

| 项目                   | 作者        | GitHub                                          | 特点                    |
| -------------------- | --------- | ----------------------------------------------- | --------------------- |
| opencode-notify      | kdcokenny | https://github.com/kdcokenny/opencode-notify    | cmux 集成、终端状态动画、智能聚焦检测 |
| opencode-notificator | panta82   | https://github.com/panta82/opencode-notificator | 简单直接、声音通知、跨平台支持       |
| opencode-notifier    | mohak34   | https://github.com/mohak34/opencode-notifier    | 功能最丰富、配置灵活、10+ 事件类型   |

---

## 项目一：opencode-notify (kdcokenny)

### 架构设计

**核心理念**: "当 AI 需要你时才通知人类，而不是每个微事件都通知"

```
┌─────────────────────────────────────────────────────────────┐
│                    opencode-notify                         │
├─────────────────────────────────────────────────────────────┤
│  配置层 (JSON)          │  notify.ts (主插件)              │
│  ~/.config/opencode/    │                                  │
│  └── kdco-notify.json   │  ┌──────────────────────────┐   │
│                         │  │ 事件处理器               │   │
│  依赖:                  │  │ - session.idle           │   │
│  - node-notifier        │  │ - session.error          │   │
│  - detect-terminal      │  │ - permission.updated     │   │
│  - alerter (macOS)      │  │ - question               │   │
│                         │  └──────────────────────────┘   │
│                         │  ┌──────────────────────────┐   │
│                         │  │ 通知发送器               │   │
│                         │  │ ┌─────────────────────┐  │   │
│                         │  │ │ cmux (优先)        │  │   │
│                         │  │ │  ↓ 失败            │  │   │
│                         │  │ │ 桌面通知 (降级)    │  │   │
│                         │  │ │  - macOS: alerter  │  │   │
│                         │  │ │  - Win: SnoreToast │  │   │
│                         │  │ │  - Linux: notify-send│ │   │
│                         │  │ └─────────────────────┘  │   │
│                         │  └──────────────────────────┘   │
│                         │  ┌──────────────────────────┐   │
│                         │  │ 终端状态管理 (OSC/cmux) │   │
│                         │  │ - 动画状态指示器         │   │
│                         │  │ - 会话状态栏更新         │   │
│                         │  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 技术选型

| 组件       | 技术                | 用途                        |
| -------- | ----------------- | ------------------------- |
| 核心运行时    | Bun + TypeScript  | OpenCode 插件执行环境           |
| 通知库      | `node-notifier`   | 跨平台桌面通知                   |
| 终端检测     | `detect-terminal` | 37+ 终端模拟器自动识别             |
| macOS 原生 | `alerter`         | macOS Notification Center |
| 状态管理     | `cmux` CLI        | 终端状态栏/标签页更新               |
| 终端标题     | OSC 转义序列          | 动态更新终端窗口标题                |

### 事件类型

```typescript
// 通知触发事件
- session.idle       // 会话完成 (父会话)
- session.error      // 会话错误
- permission.updated // 权限请求
- question (tool)    // 问题工具调用

// 可选: 子会话通知 (默认关闭)
- session.idle (child)  // 子代理完成
- session.error (child) // 子代理错误
```

### 配置系统

```json
{
  "notifyChildSessions": false,  // 是否通知子会话
  "terminal": "ghostty",         // 强制指定终端
  "sounds": {                     // 每种事件的声音
    "idle": "Glass",
    "error": "Basso",
    "permission": "Submarine",
    "question": "Submarine"
  },
  "quietHours": {                 // 免打扰时段
    "enabled": false,
    "start": "22:00",
    "end": "08:00"
  }
}
```

### 核心特性

1. **cmux 原生集成**
   
   - 优先通过 `cmux notify` 发送通知
   - 会话状态动画（⠋⠙⠹⠸⠼ 等旋转符号）
   - 状态栏实时更新

2. **智能聚焦检测** (macOS)
   
   - 使用 AppleScript 检测前台应用
   - 终端聚焦时不发送通知
   - 点击通知可聚焦终端

3. **去重机制**
   
   - Question: 1500ms 去重窗口
   - Permission: 1500ms 去重窗口
   - Ready: 1500ms 去重窗口

4. **OSC 标题更新**
   
   - 会话忙时显示旋转动画
   - 空闲时恢复原始标题

---

## 项目二：opencode-notificator (panta82)

### 架构设计

**设计理念**: 简单直接，开箱即用

```
┌──────────────────────────────────────────────────────┐
│               opencode-notificator                   │
├──────────────────────────────────────────────────────┤
│  源代码结构               │  部署流程                │
│  src/                     │                          │
│  ├── notificator.ts       │  npm run build          │
│  ├── config.ts            │      ↓                  │
│  ├── sound.ts             │  npm run deploy         │
│  └── sounds/              │      ↓                  │
│       ├── ding1.mp3       │  ~/.config/opencode/    │
│       ├── ...             │  └── plugins/           │
│       └── ding6.mp3       │       └── notificator/  │
│                           │            └── dist/    │
├──────────────────────────────────────────────────────┤
│  通知机制                                          │
│  ┌──────────────────────────────────────────────┐ │
│  │ 桌面通知: osascript (macOS) / notify-send    │ │
│  │ 声音播放: afplay (macOS) / ffplay (Linux)   │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

### 技术选型

| 组件   | 技术                          | 用途     |
| ---- | --------------------------- | ------ |
| 构建工具 | TypeScript + npm scripts    | 编译并部署  |
| 通知   | `osascript` / `notify-send` | 系统原生通知 |
| 声音   | `afplay` / `ffplay`         | 音频播放   |
| 配置   | JSONC (带注释 JSON)            | 用户配置   |

### 事件类型

```typescript
// 触发通知的事件
- session.idle          // 代码生成完成
- permission.asked      // 请求权限

// 可选声音 (自动分配)
- 每个项目根据 hash 自动分配唯一声音
```

### 配置系统

```jsonc
{
  "enabled": true,
  "showDesktopNotification": {
    "enabled": true
  },
  "playSound": {
    "enabled": true,
    "fileSeed": 0,  // 0 = 自动分配
    // 或指定具体文件:
    // "file": "ding1.mp3"
  }
}
```

### 核心特性

1. **项目级声音隔离**
   
   - 基于项目路径哈希自动分配声音
   - 不同项目有不同声音标识

2. **自定义声音**
   
   - 支持 `~/.config/opencode/plugin/notificator-sounds/`
   - 格式: mp3, wav, ogg, m4a, aac, flac

3. **跨平台支持**
   
   - macOS: 原生 `osascript` + `afplay`
   - Linux: `notify-send` + `ffplay`

---

## 项目三：opencode-notifier (mohak34)

### 架构设计

**设计理念**: 功能丰富、高度可配置

```
┌─────────────────────────────────────────────────────────────────┐
│                    opencode-notifier                           │
├─────────────────────────────────────────────────────────────────┤
│  模块化架构                                                    │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐  │
│  │ config.ts  │ │ notify.ts  │ │ sound.ts   │ │ focus.ts   │  │
│  │ 配置管理   │ │ 通知发送   │ │ 声音播放   │ │ 聚焦检测   │  │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘  │
│  ┌────────────┐ ┌────────────┐ ┌────────────────────────────┐  │
│  │ bell.ts    │ │ command.ts │ │ permission-dedupe.ts       │  │
│  │ 终端响铃   │ │ 外部命令   │ │ 权限去重                   │  │
│  └────────────┘ └────────────┘ └────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  事件系统 (10+ 种事件)                                         │
│  ┌──────────────┬────────────────────────────────────────────┐ │
│  │ 类型         │ 描述                                       │ │
│  ├──────────────┼────────────────────────────────────────────┤ │
│  │ permission   │ 需要权限                                   │ │
│  │ complete     │ 会话完成                                   │ │
│  │ subagent_complete │ 子代理完成                          │ │
│  │ error        │ 错误发生                                   │ │
│  │ question     │ 问题工具                                   │ │
│  │ user_cancelled│ 用户取消                                  │ │
│  │ plan_exit    │ 计划退出                                   │ │
│  │ session_started│ 会话开始                                 │ │
│  │ user_message │ 用户消息                                   │ │
│  │ client_connected│ 客户端连接                             │ │
│  └──────────────┴────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 技术选型

| 组件   | 技术                            | 用途                              |
| ---- | ----------------------------- | ------------------------------- |
| 通知库  | `node-notifier` + `osascript` | 多后端通知支持                         |
| 声音播放 | 多播放器回退                        | paplay → aplay → mpv → ffplay   |
| 聚焦检测 | 多平台实现                         | AppleScript / xdotool / hyprctl |
| 配置系统 | JSON + 类型定义                   | 完整类型安全                          |
| 测试   | 内置测试文件                        | *.test.ts                       |

### 通知后端支持

```typescript
// macOS
- "osascript" (默认): 可靠但显示 Script Editor 图标
- "node-notifier": 显示 OpenCode 图标但偶尔丢失
- "ghostty": Ghostty 终端 OSC 9 原生通知

// Linux
- notify-send (libnotify)
- 支持通知分组 (notify-send 0.8+)
- KDE 跳转回终端功能

// Windows
- node-notifier (SnoreToast)
- WSL 支持
```

### 聚焦检测实现

```typescript
// 多平台支持矩阵
┌──────────────┬──────────────────────────────────────┐
│ 平台         │ 方法                                 │
├──────────────┼──────────────────────────────────────┤
│ macOS        │ AppleScript System Events            │
│ Linux X11    │ xdotool                              │
│ Hyprland     │ hyprctl activewindow                 │
│ Niri         │ niri msg --json focused-window       │
│ Sway         │ swaymsg -t get_tree                  │
│ KDE          │ kdotool                              │
│ tmux         │ tmux display-message                 │
│ WezTerm      │ wezterm cli list-clients             │
│ Windows      │ GetForegroundWindow() via PowerShell │
└──────────────┴──────────────────────────────────────┘
```

### 配置系统 (最丰富)

```typescript
interface NotifierConfig {
  // 全局开关
  sound: boolean                    // 声音总开关
  notification: boolean             // 通知总开关
  bell: boolean                     // 终端响铃

  // 显示选项
  showProjectName: boolean          // 显示项目名
  showFullPath: boolean             // 显示完整路径
  showSessionTitle: boolean         // 显示会话标题
  showIcon: boolean                 // 显示图标
  customIconPath: string | null     // 自定义图标

  // 行为控制
  suppressWhenFocused: boolean      // 聚焦时抑制
  enableOnDesktop: boolean          // 桌面客户端启用
  minDuration: number               // 最小持续时间阈值
  timeout: number                   // 通知超时(秒)

  // 通知系统
  notificationSystem: "osascript" | "node-notifier" | "ghostty"
  suppressGhosttySound: boolean     // Ghostty 声音抑制

  // Linux 特定
  linux: {
    grouping: boolean               // 通知分组
  }

  // 事件级配置
  events: {
    [eventType: string]: {
      sound: boolean
      notification: boolean
      command: boolean
      bell: boolean
    }
  }

  // 自定义消息模板
  messages: {
    [eventType: string]: string     // 支持占位符
  }

  // 自定义声音
  sounds: {
    [eventType: string]: string | null
  }

  // 音量控制
  volumes: {
    [eventType: string]: number     // 0-1
  }

  // 外部命令
  command: {
    enabled: boolean
    path: string
    args: string[]
    minDuration: number
  }
}
```

### 消息占位符

```typescript
// 配置示例
{
  "messages": {
    "complete": "Session finished: {sessionTitle}",
    "error": "Error in {projectName} at {timestamp}"
  }
}

// 可用占位符
{sessionTitle}  // 会话标题
{agentName}     // 子代理名称
{projectName}   // 项目名
{timestamp}     // 时间戳 (HH:MM:SS)
{turn}          // 全局计数器
```

### 声音播放器回退链

```typescript
// Linux 声音播放优先级
async function playOnLinux(soundPath: string, volume: number) {
  const players = [
    { command: "paplay", args: [`--volume=${pulseVolume}`, soundPath] },
    { command: "aplay", args: [soundPath] },
    { command: "mpv", args: ["--no-video", ..., `--volume=${percentVolume}`, soundPath] },
    { command: "ffplay", args: ["-nodisp", "-autoexit", "-volume", `${percentVolume}`, soundPath] }
  ]

  // 依次尝试直到成功
  for (const player of players) {
    try {
      await runCommand(player.command, player.args)
      return
    } catch { continue }
  }
}
```

---

## 技术对比总结

### 功能对比表

| 功能         | opencode-notify | opencode-notificator | opencode-notifier |
| ---------- | --------------- | -------------------- | ----------------- |
| **核心事件**   | 4种              | 2种                   | 10+种              |
| 会话完成       | ✅               | ✅                    | ✅                 |
| 会话错误       | ✅               | ❌                    | ✅                 |
| 权限请求       | ✅               | ✅                    | ✅                 |
| 问题工具       | ✅               | ❌                    | ✅                 |
| 子代理完成      | ✅               | ❌                    | ✅                 |
| 计划退出       | ❌               | ❌                    | ✅                 |
| 会话开始       | ❌               | ❌                    | ✅                 |
| 用户消息       | ❌               | ❌                    | ✅                 |
| **通知类型**   |                 |                      |                   |
| 桌面通知       | ✅               | ✅                    | ✅                 |
| 声音提醒       | ✅               | ✅                    | ✅                 |
| 终端响铃       | ❌               | ❌                    | ✅                 |
| 外部命令       | ❌               | ❌                    | ✅                 |
| **平台支持**   |                 |                      |                   |
| macOS      | ✅               | ✅                    | ✅                 |
| Linux      | ✅               | ✅                    | ✅                 |
| Windows    | ✅               | ❌                    | ✅                 |
| **高级功能**   |                 |                      |                   |
| 聚焦检测       | ✅ (macOS)       | ❌                    | ✅ (全平台)           |
| 免打扰时段      | ✅               | ❌                    | ❌                 |
| 通知去重       | ✅               | ❌                    | ✅                 |
| 最小持续时间     | ❌               | ❌                    | ✅                 |
| 通知分组       | ❌               | ❌                    | ✅ (Linux)         |
| 配置灵活性      | 中               | 低                    | 高                 |
| 终端状态动画     | ✅ (cmux)        | ❌                    | ❌                 |
| **技术栈**    |                 |                      |                   |
| 包管理器       | OCX             | npm                  | npm               |
| 安装方式       | Registry        | 手动部署                 | npm               |
| TypeScript | ✅               | ✅                    | ✅                 |
| 测试覆盖       | ❌               | ❌                    | ✅                 |

### 通知后端对比

| 后端            | opencode-notify | notificator | notifier |
| ------------- | --------------- | ----------- | -------- |
| **macOS**     |                 |             |          |
| osascript     | -               | ✅           | ✅        |
| alerter       | ✅               | -           | -        |
| node-notifier | ✅               | -           | ✅        |
| ghostty OSC   | -               | -           | ✅        |
| **Linux**     |                 |             |          |
| notify-send   | ✅               | ✅           | ✅        |
| **Windows**   |                 |             |          |
| SnoreToast    | ✅               | -           | ✅        |
| **特殊**        |                 |             |          |
| cmux          | ✅               | -           | -        |

---

## 共通点提炼

### 1. 核心事件监听

所有三个插件都监听这些 OpenCode 事件：

```typescript
// 必备钩子
{
  "session.idle": async (event) => { /* 会话完成 */ },
  "permission.ask": async (permission) => { /* 权限请求 */ }
}
```

### 2. 跨平台通知实现模式

```typescript
// 标准模式
async function sendNotification(title: string, message: string) {
  const platform = process.platform

  switch (platform) {
    case "darwin":
      // macOS: osascript 或 node-notifier
      return sendMacNotification(title, message)
    case "linux":
      // Linux: notify-send
      return sendLinuxNotification(title, message)
    case "win32":
      // Windows: node-notifier (SnoreToast)
      return sendWindowsNotification(title, message)
  }
}
```

### 3. 配置加载模式

```typescript
// 统一配置路径
const configPath = path.join(
  os.homedir(), 
  ".config", 
  "opencode", 
  "plugin-name.json"
)

// 加载配置
function loadConfig() {
  try {
    const content = fs.readFileSync(configPath, "utf-8")
    return JSON.parse(content)
  } catch {
    return DEFAULT_CONFIG
  }
}
```

### 4. 声音播放实现

```typescript
// 平台特定的声音播放
async function playSound(soundPath: string) {
  switch (process.platform) {
    case "darwin":
      await $`afplay ${soundPath}`
      break
    case "linux":
      // 尝试多个播放器
      await $`paplay ${soundPath}`.catch(() => 
        $`aplay ${soundPath}`.catch(() =>
          $`ffplay -nodisp -autoexit ${soundPath}`
        )
      )
      break
    case "win32":
      await $`powershell -c (New-Object Media.SoundPlayer "${soundPath}").PlaySync()`
      break
  }
}
```

### 5. 去重机制

```typescript
// 时间窗口去重
const lastNotificationTime: Record<string, number> = {}
const DEBOUNCE_MS = 1500

function shouldSendNotification(key: string): boolean {
  const now = Date.now()
  const lastTime = lastNotificationTime[key]

  if (lastTime && now - lastTime < DEBOUNCE_MS) {
    return false
  }

  lastNotificationTime[key] = now
  return true
}
```

### 6. 插件导出模式

```typescript
// 标准插件导出
import type { Plugin } from "@opencode-ai/plugin"

export const NotificationPlugin: Plugin = async (ctx) => {
  const { client, directory } = ctx
  const config = loadConfig()

  return {
    event: async ({ event }) => {
      // 处理事件
    },
    "permission.ask": async (permission) => {
      // 处理权限
    }
  }
}

export default NotificationPlugin
```

---

## 最佳实践指南

### 1. 事件处理最佳实践

```typescript
export const BestPracticePlugin: Plugin = async ({ client, directory }) => {
  // 1. 会话状态跟踪
  const subagentSessionIds = new Set<string>()

  // 2. 内存清理（防止泄漏）
  setInterval(() => {
    // 清理过期数据
  }, 5 * 60 * 1000)

  return {
    event: async ({ event }) => {
      switch (event.type) {
        case "session.created":
          // 跟踪子代理
          if (event.properties.info?.parentID) {
            subagentSessionIds.add(event.properties.info.id)
          }
          break

        case "session.idle": {
          const sessionID = event.properties.sessionID
          const isSubagent = subagentSessionIds.has(sessionID)

          // 区分父会话和子会话
          await notify(isSubagent ? "subagent_complete" : "complete")
          break
        }

        case "session.error":
          await notify("error")
          break
      }
    }
  }
}
```

### 2. 配置系统最佳实践

```typescript
// 使用 TypeScript 类型
interface PluginConfig {
  enabled: boolean
  sound: boolean
  notification: boolean
  timeout: number
}

const DEFAULT_CONFIG: PluginConfig = {
  enabled: true,
  sound: true,
  notification: true,
  timeout: 5
}

// 深度合并配置
function loadConfig(): PluginConfig {
  const configPath = path.join(
    os.homedir(),
    ".config",
    "opencode",
    "plugin-name.json"
  )

  try {
    const content = fs.readFileSync(configPath, "utf-8")
    const userConfig = JSON.parse(content)
    return { ...DEFAULT_CONFIG, ...userConfig }
  } catch {
    return DEFAULT_CONFIG
  }
}
```

### 3. 通知发送最佳实践

```typescript
// 防抖机制
const notificationDebounces = new Map<string, number>()

async function sendNotification(
  eventType: string,
  title: string,
  message: string
) {
  // 1. 检查去重
  const now = Date.now()
  const lastTime = notificationDebounces.get(eventType)
  if (lastTime && now - lastTime < 1500) return
  notificationDebounces.set(eventType, now)

  // 2. 检查配置
  const config = loadConfig()
  if (!config.enabled) return

  // 3. 并行发送
  const promises: Promise<void>[] = []

  if (config.notification) {
    promises.push(sendDesktopNotification(title, message))
  }

  if (config.sound) {
    promises.push(playSound())
  }

  await Promise.allSettled(promises)
}
```

### 4. 平台检测最佳实践

```typescript
// 平台检测工具
function getPlatform(): "macos" | "linux" | "windows" | "unknown" {
  switch (process.platform) {
    case "darwin":
      return "macos"
    case "linux":
      return "linux"
    case "win32":
      return "windows"
    default:
      return "unknown"
  }
}

// 工具可用性检测
async function isCommandAvailable(command: string): Promise<boolean> {
  try {
    await $`which ${command}`.quiet()
    return true
  } catch {
    return false
  }
}
```

---

## 开发参考代码

### 基础通知插件模板

```typescript
// .opencode/plugins/my-notifier.ts
import type { Plugin } from "@opencode-ai/plugin"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"

// 配置接口
interface Config {
  enabled: boolean
  sound: boolean
  notification: boolean
}

const DEFAULT_CONFIG: Config = {
  enabled: true,
  sound: true,
  notification: true
}

// 加载配置
function loadConfig(): Config {
  const configPath = path.join(
    os.homedir(),
    ".config",
    "opencode",
    "my-notifier.json"
  )

  try {
    const content = fs.readFileSync(configPath, "utf-8")
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) }
  } catch {
    return DEFAULT_CONFIG
  }
}

// 发送通知
async function notify(title: string, message: string) {
  const config = loadConfig()
  if (!config.enabled) return

  const platform = process.platform

  // 桌面通知
  if (config.notification) {
    if (platform === "darwin") {
      await $`osascript -e ${`display notification "${message}" with title "${title}"`}`
    } else if (platform === "linux") {
      await $`notify-send ${title} ${message}`
    }
  }

  // 声音
  if (config.sound && platform === "darwin") {
    await $`afplay /System/Library/Sounds/Glass.aiff`
  }
}

// 插件导出
export const MyNotifierPlugin: Plugin = async ({ client, directory }) => {
  const projectName = path.basename(directory)

  return {
    event: async ({ event }) => {
      switch (event.type) {
        case "session.idle":
          await notify("OpenCode", `${projectName} 任务完成`)
          break

        case "session.error":
          await notify("OpenCode", `${projectName} 发生错误`)
          break

        case "permission.asked":
          await notify("OpenCode", "需要您的确认")
          break
      }
    }
  }
}

export default MyNotifierPlugin
```

### 高级通知插件模板

```typescript
// .opencode/plugins/advanced-notifier.ts
import type { Plugin, PluginInput } from "@opencode-ai/plugin"

// 事件类型
type EventType = "complete" | "error" | "permission" | "question"

// 完整配置
interface AdvancedConfig {
  events: Record<EventType, boolean>
  sounds: Record<EventType, string | null>
  suppressWhenFocused: boolean
  minDuration: number
}

// 会话跟踪
class SessionTracker {
  private subagentIds = new Set<string>()
  private lastBusyAt = new Map<string, number>()

  markSubagent(sessionId: string) {
    this.subagentIds.add(sessionId)
  }

  markBusy(sessionId: string) {
    this.lastBusyAt.set(sessionId, Date.now())
  }

  isSubagent(sessionId: string): boolean {
    return this.subagentIds.has(sessionId)
  }

  getDuration(sessionId: string): number {
    const lastBusy = this.lastBusyAt.get(sessionId)
    return lastBusy ? (Date.now() - lastBusy) / 1000 : 0
  }
}

export const AdvancedNotifierPlugin: Plugin = async (ctx: PluginInput) => {
  const { client, directory } = ctx
  const tracker = new SessionTracker()
  const config = loadConfig() // 实现加载逻辑

  return {
    event: async ({ event }) => {
      // 跟踪子代理
      if (event.type === "session.created" && event.properties.info?.parentID) {
        tracker.markSubagent(event.properties.info.id)
      }

      // 跟踪忙碌状态
      if (event.type === "session.status" && event.properties.status?.type === "busy") {
        tracker.markBusy(event.properties.sessionID)
      }

      // 会话完成
      if (event.type === "session.idle") {
        const sessionId = event.properties.sessionID
        const isSubagent = tracker.isSubagent(sessionId)
        const duration = tracker.getDuration(sessionId)

        // 检查最小持续时间
        if (duration < config.minDuration) return

        // 检查是否是子代理
        if (isSubagent && !config.events.subagent_complete) return

        await notify("complete", `任务完成 (${Math.round(duration)}秒)`)
      }
    },

    "permission.ask": async () => {
      if (config.events.permission) {
        await notify("permission", "需要权限确认")
      }
    },

    "tool.execute.before": async (input) => {
      if (input.tool === "question" && config.events.question) {
        await notify("question", "有问题需要回答")
      }
    }
  }
}
```

---

## 总结

### 三个项目的选择建议

| 场景      | 推荐插件                 | 理由                         |
| ------- | -------------------- | -------------------------- |
| 使用 cmux | opencode-notify      | cmux 原生集成，状态动画             |
| 简单快速    | opencode-notificator | 开箱即用，配置简单                  |
| 功能全面    | opencode-notifier    | 10+ 事件，高度可配置               |
| 多平台     | opencode-notifier    | 完整的 Windows/Linux/macOS 支持 |
| 终端聚焦    | opencode-notify      | 最佳的 macOS 聚焦检测             |

### 核心技术栈总结

```
通知发送:
├── macOS: osascript / node-notifier / alerter / Ghostty OSC
├── Linux: notify-send (libnotify)
└── Windows: node-notifier (SnoreToast)

声音播放:
├── macOS: afplay (内置)
├── Linux: paplay → aplay → mpv → ffplay (回退链)
└── Windows: PowerShell SoundPlayer

聚焦检测:
├── macOS: AppleScript System Events
├── Linux: xdotool / hyprctl / swaymsg / kdotool
├── tmux: tmux display-message
└── WezTerm: wezterm cli list-clients

配置管理:
├── 路径: ~/.config/opencode/plugin-name.json
├── 格式: JSON / JSONC
└── 加载: 运行时读取 + 默认值回退
```

### 开发要点

1. **事件监听**: 重点处理 `session.idle`, `session.error`, `permission.ask`, `tool.execute.before`
2. **去重机制**: 使用时间窗口去重避免通知轰炸
3. **平台适配**: 检测 `process.platform` 使用对应命令
4. **配置加载**: 从 `~/.config/opencode/` 读取 JSON 配置
5. **异步处理**: 使用 `Promise.allSettled` 并行发送通知和声音
6. **错误处理**: 静默失败，不要因为通知失败影响主流程

---

*分析完成于 2026-06-17*
