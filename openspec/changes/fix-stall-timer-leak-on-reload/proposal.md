# 修复：插件重载时停滞扫描定时器泄漏

## 问题描述

用户报告 fix-stall-reactivation-after-idle（finishedSessions 防护）修复无效：一次会话完成后，过几分钟飞书仍收到停滞通知。

## 根因分析（基于日志 + 进程实证）

### 直接原因（运行环境）

系统同时存在两个 opencode 进程：

- **PID 60859**（20:09:52 启动）：23:04:57 加载旧插件代码（无 finishedSessions 防护），当前会话（23:38:56 创建）的事件全部由它处理 → 23:39:01.964 idle 后，23:39:31.797 的尾随 `session.updated` 被旧代码无条件 `touchActivity` 重新激活 → 23:43:45 误发停滞通知
- **PID 93591**（23:38:43 启动）：加载了新代码，但用户会话不在其中

**代码部署 ≠ 进程重载**：dist 已更新（23:38），但运行中的旧 opencode 进程仍执行旧代码。跨进程的旧实例只能由用户重启解决，插件代码无法清理其他进程的内存。

### 代码缺陷（本 change 修复目标）

`src/index.ts:65-66`：

```ts
const stallCheckMs = config.categories.stall?.stall_check_interval_ms ?? 60_000
setInterval(() => { void handler.scanStalledSessions() }, stallCheckMs)
```

每次插件初始化（`OpenCodeLarkBridge` 被调用）都**无条件创建新的 `setInterval`**，从不清理旧定时器。opencode 进程内插件重载（或同进程多次初始化，日志 22:56:52 / 23:04:57 / 23:38:45 三次注册）时：

1. 旧 handler 实例的定时器继续运行，持续扫描旧实例的内存状态（`lastActive` 等）
2. 旧实例处理过的事件（包括旧会话的活动与尾随事件）持续产生误发停滞通知
3. 新实例的防护（finishedSessions）只保护新实例自己的状态，对旧实例完全无效——**这正是「修复了但没效果」的代码层根因**

## 修复目标

- 插件重复初始化时，先清理前一次创建的停滞扫描定时器（同进程内重载后只保留最新定时器）
- 定时器句柄模块级管理，跨 `OpenCodeLarkBridge` 调用共享
- 不改变扫描逻辑、通知逻辑与各事件分支行为

## 说明

跨进程旧实例（PID 60859）导致的误发无法由代码修复，需用户关闭旧 opencode 进程后重启；本次代码修复保证**同进程重载**后旧状态不再被扫描。
