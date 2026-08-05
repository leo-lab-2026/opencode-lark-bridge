# 修复方案：模块级定时器句柄，初始化前清理

## 方案

`src/index.ts` 模块级保存停滞扫描定时器句柄，`OpenCodeLarkBridge` 每次初始化时先清理旧定时器再创建新定时器：

```ts
let stallTimer: ReturnType<typeof setInterval> | null = null

export const OpenCodeLarkBridge = async (ctx: any) => {
  ...
  const stallCheckMs = config.categories.stall?.stall_check_interval_ms ?? 60_000
  if (stallTimer !== null) {
    clearInterval(stallTimer)
  }
  stallTimer = setInterval(() => { void handler.scanStalledSessions() }, stallCheckMs)
  ...
}
```

### 关键点

- 模块级 `stallTimer` 变量位于 `OpenCodeLarkBridge` 函数外，跨多次调用共享
- 每次初始化先 `clearInterval` 旧句柄，确保同进程内任意时刻只有一个激活的扫描定时器
- 旧 handler 实例随定时器清理被 GC 回收，其内存状态（`lastActive`、`stallMeta`、`finishedSessions` 等）不再被扫描
- 配置缺失时提前返回的路径（`resolveConfigPath` 为空、`loadConfig` 失败）不触碰定时器（保持既有行为：这些路径不创建定时器）

## 影响面

- 仅修改 `src/index.ts`（1 个源文件）
- 行为变化仅限「同一进程内插件重复初始化」场景：旧定时器被清理，不再双定时器并行扫描
- 首次初始化、正常单实例运行的行为完全不变

## 已知局限（用户侧行动）

跨进程（多个 opencode 进程并存）的旧实例无法由代码清理，需要用户关闭旧进程后重启，新代码才会生效。
