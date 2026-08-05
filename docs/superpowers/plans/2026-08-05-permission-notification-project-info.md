---
change: permission-notification-project-info
design-doc: docs/superpowers/specs/2026-08-05-permission-notification-project-info-design.md
base-ref: 2af2a09d86839c795d7f4e97f44afaa58f3e85e5
---

# permission 通知携带项目信息 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 6 类通知中唯一缺项目信息的 permission 通知（含 `permission.ask` hook 与 `permission.asked` 事件两条路径）支持 `{projectName}` 模板变量，与 completion/question/retry/stall 对齐。

**Architecture:** mapper 层在 `mapPermissionEvent` 中增加 `{projectName}` 渲染（提取规则与 retry-mapper 一致，缺失/空白降级 `unknown`，模板未含变量时原样输出）；入口层在 `src/index.ts` 的两条路径注入 projectName——`permission.ask` hook 构造 `{ ...input, projectName }` 新对象（不修改 hook 只读输入），`enhanceEvent` 增加 `permission.asked` 分支（与 `question.asked` 同模式，返回新对象不修改原事件）。

**Tech Stack:** TypeScript（strict）+ Bun（Bun test）；构建 `npm run build`（tsc → dist/）。

## 全局约束

- 事件 hook 输入只读：`permission.ask` 不得修改 OpenCode 传入的 `input`，必须构造新对象
- 状态必须内存内：不新增任何持久化/跨进程状态
- 通知失败不得阻塞主流程：lark-cli 失败 → 记日志 + 跳过（现有行为，不改变）
- mapper 字段缺失一律降级字符串 `unknown`，不抛错
- `enhanceEvent` 为增强返回新对象，原 event 对象不得被修改（引用/字段断言）
- 用户自定义模板未含 `{projectName}` 时文本原样输出（模板驱动，无 Project 行）
- 去重 key（`tool:resource`）不受影响：`extractResource` 不读取 projectName
- 运行配置文件（`.opencode/opencode-lark-bridge.config.jsonc`、`~/.config/opencode/opencode-lark-bridge.config.jsonc`）被 .gitignore 排除/在仓库外：只改本地文件，**不进 commit**
- `extractToolName` 在 `permission-mapper.ts:5` 与 `event-handler.ts:24` 各有一份副本——本变更不涉及，不得改动
- 无 lint/format 配置：风格靠 tsconfig strict + 现有代码惯例

---

## 文件结构

| 文件 | 责任 | 变更类型 |
| --- | --- | --- |
| `src/events/permission-mapper.ts` | DEFAULT_TEMPLATE 加 Project 行；`mapPermissionEvent` 渲染 `{projectName}` | 修改 |
| `tests/permission-mapper.test.ts` | 新增 projectName 渲染 5 个用例 | 修改（追加） |
| `src/index.ts` | `enhanceEvent` 加 `permission.asked` 分支；`permission.ask` hook 注入 projectName | 修改 |
| `tests/index.test.ts` | 新增 hook/事件注入 + 原事件不可变 3 个用例 | 修改（追加） |
| `opencode-lark-bridge.config.example.jsonc` | permission 模板补 `Project: {projectName}` + 注释变量说明 | 修改（git 跟踪） |
| `.opencode/opencode-lark-bridge.config.jsonc` | 同上（本地手动同步，git 忽略） | 修改（不 commit） |
| `~/.config/opencode/opencode-lark-bridge.config.jsonc` | 同上（仓库外） | 修改（不 commit） |
| `README.md` | 配置表 + 权限类型覆盖小节标注 `{projectName}` | 修改 |

---

### Task 1: Mapper 支持 `{projectName}`

**Files:**
- Modify: `src/events/permission-mapper.ts:3`（DEFAULT_TEMPLATE）、`src/events/permission-mapper.ts:113-117`（渲染链）
- Test: `tests/permission-mapper.test.ts`（文件末尾追加 describe）

**Interfaces:**
- Consumes: 现有 `mapPermissionEvent(event: any, target: NotificationTarget, template?: string): NotificationMessage` 签名不变
- Produces: `mapPermissionEvent` 渲染 `{projectName}`（`props.projectName` 提取：`typeof === "string" && trim() 非空 ? trim() : "unknown"`）；默认模板含 `Project: {projectName}` 行（位于 Tool 行之前）

- [ ] **Step 1: 写失败测试**

在 `tests/permission-mapper.test.ts` 文件末尾追加（保留现有 `describe("mapPermissionEvent", ...)` 块不变）：

```ts
describe("mapPermissionEvent projectName", () => {
  it("renders Project line with projectName from properties", () => {
    const event = {
      properties: {
        tool: "bash",
        args: { command: "rm -f /tmp/foo.txt" },
        projectName: "My Project",
      },
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Project: My Project")
  })

  it("replaces {projectName} in custom template", () => {
    const event = {
      properties: {
        tool: "read",
        args: { filePath: "/etc/hosts" },
        projectName: "My Project",
      },
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" }, "Project: {projectName}\n{tool} wants {resource}")
    expect(msg.text).toBe("Project: My Project\nread wants /etc/hosts")
  })

  it("falls back to unknown when projectName is missing", () => {
    const event = { properties: { tool: "bash", args: { command: "ls" } } }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Project: unknown")
  })

  it("falls back to unknown when projectName is blank", () => {
    const event = {
      properties: { tool: "bash", args: { command: "ls" }, projectName: "   " },
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Project: unknown")
  })

  it("keeps text unchanged when custom template has no {projectName}", () => {
    const event = {
      properties: { tool: "read", args: { filePath: "/etc/hosts" }, projectName: "My Project" },
    }
    const msg = mapPermissionEvent(event, { chat_id: "oc_1" }, "{tool} wants {resource}")
    expect(msg.text).toBe("read wants /etc/hosts")
    expect(msg.text).not.toContain("Project:")
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/permission-mapper.test.ts`
Expected: 新增 5 个用例失败——默认模板无 `Project:` 行（`toContain` 不匹配），`{projectName}` 未被替换（`toBe` 不等）。现有用例全部通过。

- [ ] **Step 3: 最小实现**

`src/events/permission-mapper.ts:3` 修改 DEFAULT_TEMPLATE：

```ts
const DEFAULT_TEMPLATE = "🔔 OpenCode Permission Request\nProject: {projectName}\nTool: {tool}\nOperation: {operation}\nTarget: {resource}"
```

`src/events/permission-mapper.ts` `mapPermissionEvent` 中，`const props = ...` 之后新增 projectName 提取（位置：`const permission = ...` 一行之前）：

```ts
  const projectName = typeof props.projectName === "string" && props.projectName.trim() ? props.projectName.trim() : "unknown"
```

渲染链（当前三行 `.replace`）追加：

```ts
  const text = (template || DEFAULT_TEMPLATE)
    .replace(/{tool}/g, tool)
    .replace(/{operation}/g, operation)
    .replace(/{resource}/g, resource)
    .replace(/{projectName}/g, projectName)
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/permission-mapper.test.ts`
Expected: 全部用例 PASS（原 22 个 + 新增 5 个）。注意 "uses custom template" 用例期望 `toBe("read wants /etc/hosts")`——其模板无 `{projectName}`，replace 无匹配，仍应通过。

- [ ] **Step 5: Commit**

```bash
git add src/events/permission-mapper.ts tests/permission-mapper.test.ts
git commit -m "feat: support {projectName} in permission notification template"
```

---

### Task 2: 两条路径注入 projectName（enhanceEvent + permission.ask hook）

**Files:**
- Modify: `src/index.ts:113-176`（enhanceEvent，question.asked 分支之后插入）、`src/index.ts:191`（permission.ask hook）
- Test: `tests/index.test.ts`（"deployed plugin config resolution" describe 内追加）

**Interfaces:**
- Consumes: Task 1 的 `mapPermissionEvent`（现已渲染 `{projectName}`）；闭包内现有 `projectName`（`resolveProjectName(ctx)` 结果，src/index.ts:82）与 `nonEmpty`（src/index.ts:85）
- Produces:
  - `enhanceEvent` 对 `type === "permission.asked"` 返回 `{ ...event, properties: { ...props, projectName: nonEmpty(props?.projectName) ?? projectName } }`（`props = event?.properties ?? event ?? {}`），不修改原对象
  - `permission.ask` hook 调用 `mapPermissionEvent({ ...input, projectName }, target, categoryConfig.template)`
  - 事件路径通知日志文案：`Sending notification`（event-handler.ts:366，无需改动）；hook 路径日志文案：`Sending permission notification`（src/index.ts:192）

- [ ] **Step 1: 写失败测试**

在 `tests/index.test.ts` 的 `describe("deployed plugin config resolution", ...)` 块内追加 3 个用例（放在 "injects projectName for question.asked events via event hook with real OpenCode shape" 用例之后）：

```ts
    it("sends permission notification with project name via permission.ask hook", async () => {
      writeFileSync(
        path.join(tempDir, ".opencode", "opencode-lark-bridge.config.jsonc"),
        JSON.stringify({
          app_id: "test-app",
          app_secret: "test-secret",
          default_target: { chat_id: "test-chat" },
          log_file: logFile,
          categories: { permission: { target: { chat_id: "oc_perm" } } },
        })
      )

      const hooks = await plugin({
        directory: tempDir,
        worktree: tempDir,
        project: { name: "Perm Project" },
      } as any)

      await hooks["permission.ask"]({
        tool: "bash",
        args: { command: "rm -f /tmp/test.txt" },
      })

      const logs = readFileSync(logFile, "utf-8")
      expect(logs).toContain("Sending permission notification")
      expect(logs).toContain("Project: Perm Project")
    }, 10000)

    it("injects projectName into permission.asked events via enhanceEvent", async () => {
      writeFileSync(
        path.join(tempDir, ".opencode", "opencode-lark-bridge.config.jsonc"),
        JSON.stringify({
          app_id: "test-app",
          app_secret: "test-secret",
          default_target: { chat_id: "test-chat" },
          log_file: logFile,
          categories: { permission: { target: { chat_id: "oc_perm" } } },
        })
      )

      const hooks = await plugin({
        directory: tempDir,
        worktree: tempDir,
        project: { name: "Perm Event Project" },
      } as any)

      await hooks.event({
        event: {
          type: "permission.asked",
          properties: {
            tool: { name: "bash" },
            patterns: ["rm -f /tmp/foo.txt"],
          },
        },
      })

      const logs = readFileSync(logFile, "utf-8")
      expect(logs).toContain("Sending notification")
      expect(logs).toContain("Project: Perm Event Project")
    }, 10000)

    it("does not mutate the original permission.asked event object", async () => {
      writeFileSync(
        path.join(tempDir, ".opencode", "opencode-lark-bridge.config.jsonc"),
        JSON.stringify({
          app_id: "test-app",
          app_secret: "test-secret",
          default_target: { chat_id: "test-chat" },
          log_file: logFile,
          categories: { permission: { target: { chat_id: "oc_perm" } } },
        })
      )

      const hooks = await plugin({
        directory: tempDir,
        worktree: tempDir,
        project: { name: "Perm Project" },
      } as any)

      const original = {
        type: "permission.asked",
        properties: {
          tool: { name: "bash" },
          patterns: ["rm -f /tmp/foo.txt"],
        },
      }

      await hooks.event({ event: original })

      expect((original.properties as Record<string, unknown>).projectName).toBeUndefined()
    }, 10000)
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/index.test.ts`
Expected: 前两个新用例失败（通知文本无 `Project:` 行）；"does not mutate" 用例此刻可能通过（enhanceEvent 尚未处理该类型时原样返回）。现有用例全部通过。

- [ ] **Step 3: 最小实现**

`src/index.ts` `enhanceEvent` 中，在 `question.asked` 分支（src/index.ts:126-135）之后、`session.error` 分支（src/index.ts:136）之前插入：

```ts
    if (type === "permission.asked") {
      const props = event?.properties ?? event ?? {}
      return {
        ...event,
        properties: {
          ...props,
          projectName: nonEmpty(props?.projectName) ?? projectName,
        },
      }
    }
```

`src/index.ts:191` `permission.ask` hook 修改调用（仅此行，其余不动）：

```ts
      const message = mapPermissionEvent({ ...input, projectName }, target, categoryConfig.template)
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/index.test.ts`
Expected: 全部用例 PASS（含新增 3 个）。

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: inject projectName into permission.ask hook and permission.asked events"
```

---

### Task 3: 配置同步（示例 + 项目级 + 全局运行配置）

**Files:**
- Modify: `opencode-lark-bridge.config.example.jsonc`（git 跟踪，参与 commit）
- Modify: `.opencode/opencode-lark-bridge.config.jsonc`（git 忽略，仅本地，不进 commit）
- Modify: `~/.config/opencode/opencode-lark-bridge.config.jsonc`（仓库外，仅本地，不进 commit）

**Interfaces:**
- Consumes: 无（纯配置文本）
- Produces: 三个文件的 `categories.permission.template` 均含 `Project: {projectName}` 行；文件头 permission 变量注释区新增 `{projectName}` 说明

**注意**：两个运行配置只改两处文本（注释区加一行、template 字符串加一行），**不得覆盖用户其他修改**（如项目级配置的 `retry_threshold: 4`、`stall_timeout_ms: 200000`、真实凭证等保持原样）。

- [ ] **Step 1: 修改示例配置**

`opencode-lark-bridge.config.example.jsonc`：

a) 文件头 `=== 权限通知模板变量（permission） ===` 注释块（当前第 5-18 行）在 `{tool}` 行之前插入：

```
//   {projectName} 项目名（缺失/空白时降级 unknown）
```

b) permission 分类的 template（第 62 行）改为：

```jsonc
      "template":  "🔔 OpenCode 权限申请\nProject: {projectName}\n工具：{tool}\n操作：{operation}\n目标：{resource}"
```

- [ ] **Step 2: 同步项目级运行配置（本地，不 commit）**

`.opencode/opencode-lark-bridge.config.jsonc`：与 Step 1 相同两处修改（注释区加 `{projectName}` 行 + template 加 `Project: {projectName}` 行）。只改这两处，文件其余内容（真实 app_id/app_secret、`retry_threshold: 4`、`stall_timeout_ms: 200000` 等）保持原样。

- [ ] **Step 3: 同步全局运行配置（本地，不 commit）**

`~/.config/opencode/opencode-lark-bridge.config.jsonc`：同样两处修改（该文件无 retry/stall 分类、error 注释与示例略有差异，仅动 permission 注释区与 permission.template 两处）。

- [ ] **Step 4: 验证配置可解析**

Run: `bun -e "import { loadConfig } from './src/config.ts'; for (const p of ['/home/lifxu/src/opencode-lark-bridge/opencode-lark-bridge.config.example.jsonc','/home/lifxu/src/opencode-lark-bridge/.opencode/opencode-lark-bridge.config.jsonc','/home/lifxu/.config/opencode/opencode-lark-bridge.config.jsonc']) { const c = loadConfig(p); console.log(p, '->', c.categories.permission.template.includes('{projectName}')) }"`
Expected: 三行均输出 `true`（JSONC 解析成功且模板含变量）。若失败（如全局配置缺 categories.permission），运行该文件的 `mapPermissionEvent` 渲染即受模板驱动——此时改为手工核对三处文本包含 `Project: {projectName}` 即可。

- [ ] **Step 5: Commit（仅示例配置）**

```bash
git add opencode-lark-bridge.config.example.jsonc
git commit -m "chore: add {projectName} to permission template in example config"
```

---

### Task 4: 文档（README）

**Files:**
- Modify: `README.md:284`（配置表）、`README.md:301-318`（权限类型覆盖小节）

**Interfaces:**
- Consumes: 无
- Produces: README 配置表示例与权限类型覆盖小节标注 `{projectName}` 变量

- [ ] **Step 1: 更新配置表**

`README.md:284` 将 `categories.permission.template` 行示例改为：

```
| `categories.permission.template` | 权限通知模板          | `🔔 权限申请\nProject: {projectName}\n{tool} {operation} {resource}` |
```

- [ ] **Step 2: 更新权限类型覆盖小节**

`README.md:303` 开头句改为：

```markdown
`{tool}` / `{operation}` / `{resource}` / `{projectName}` 四个模板变量对所有 OpenCode 权限类型都生效。`{resource}` 的取值规则：
```

在 `README.md:318`（"字段找不到时 `{resource}` 优雅降级为字符串 `unknown`，不会抛错。"）之后追加一段：

```markdown
`{projectName}` 为当前项目名（`ctx.project.name` → worktree/directory basename），缺失或空白时降级为字符串 `unknown`；用户自定义模板未包含 `{projectName}` 时通知文本不含 Project 行。
```

- [ ] **Step 3: 核对文档**

Run: `rg -n "projectName" README.md`
Expected: 新增行出现；确认 permission 相关段落（284、303、318 附近）均已覆盖。

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document {projectName} in permission notification templates"
```

---

### Task 5: 最终验证

**Files:**
- 无代码改动，仅验证

**Interfaces:**
- Consumes: Task 1-4 全部产物

- [ ] **Step 1: 全量构建**

Run: `npm run build`
Expected: tsc 编译零错误（strict）。`dist/` 下产物更新。

- [ ] **Step 2: 全量测试**

Run: `bun test`
Expected: 全部测试 PASS（无失败、无 skipped 中新增失败）。

- [ ] **Step 3: 回归核对 git 状态**

Run: `git status --short`
Expected: 仅期望的文件变更。确认 `.opencode/opencode-lark-bridge.config.jsonc` 未出现在变更列表（git 忽略）；`~/.config/...` 不涉及。若此前任务已各自 commit，此时工作区应干净（或仅有预期外改动需排查）。

- [ ] **Step 4: 手工端到端核对（可选，需真实凭证）**

如环境有已登录的 `lark-cli`，在 `ctx.project.name` 可解析的目录触发一次权限操作（如 `rm /tmp/opencode-test-file`），确认飞书通知文本含 `Project: <项目名>` 行。

---

## 自检对照（Design Doc 覆盖率）

| Design Doc 要求 | 对应任务 |
| --- | --- |
| DEFAULT_TEMPLATE 增加 `Project: {projectName}` 行 | Task 1 |
| `mapPermissionEvent` 渲染 `{projectName}`，缺失/空白降级 `unknown` | Task 1（Step 3：`trim()` 非空判断） |
| 用户模板无 `{projectName}` 时原样输出 | Task 1（测试第 5 例） |
| `permission.ask` hook 构造 `{ ...input, projectName }`（不修改输入） | Task 2（Step 3） |
| `enhanceEvent` 增加 `permission.asked` 分支，`nonEmpty(props?.projectName) ?? projectName` | Task 2（Step 3） |
| 去重 key 不受影响 | Task 1-2（不改 `extractResource`/`dedupeKey`） |
| mapper 测试：默认模板 Project 行 / 替换 / 缺失 / 空白 / 自定义模板无变量 | Task 1 |
| index 测试：hook 通知含项目名 / enhanceEvent 注入 / 原事件不可变 | Task 2 |
| 示例配置 + 项目级 + 全局配置同步 | Task 3 |
| README 标注 `{projectName}` | Task 4 |
| `npm run build` + `bun test` 验证 | Task 5 |
