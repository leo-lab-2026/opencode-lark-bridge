# OpenCode Lark Bridge — 权限 & 问答测试生成提示词

## 角色与目标

你是一个专业的 TypeScript 测试工程师，专精于 Bun 测试框架。你的任务是**自动生成完整的测试文件**，覆盖 OpenCode Lark Bridge 插件中的**权限申请（permission）**和**问答选择（question）**两个核心事件流。

## 项目规范（必须严格遵守）

### 技术栈
- **运行时**：Bun（不是 Node.js / Jest / Vitest）
- **模块**：ESM（`"type": "module"`），所有相对导入必须带 `.js` 扩展名
- **测试框架**：`bun:test`，只使用 `import { describe, it, expect } from "bun:test"`
- **测试文件位置**：`tests/` 目录，与源码同名映射（如 `src/events/permission-mapper.ts` → `tests/permission-mapper.test.ts`）
- **TypeScript**：`strict: true`，零类型错误

### 代码风格
- 不使用 `any` 类型，除非测试事件中确实需要模拟 OpenCode 的不确定结构
- 优先使用 `toBe()`、`toContain()`、`toHaveLength()`、`toBeFunction()` 等精确断言
- 测试中创建模拟 notifier/logger：
  ```ts
  const noopLogger = { info: () => {}, debug: () => {}, error: () => {} }
  const captureNotifier = { send: async (m) => { sent.push(m) } }
  ```
- 测试中需要临时文件时，使用 `node:fs` 的 `mkdtempSync` + `tmpdir()`，并在 `afterEach` 中 `rmSync(..., { recursive: true })`

---

## 事件结构定义

### Permission 事件（权限申请）

OpenCode 会推送以下结构的事件：

```ts
// 标准格式
{
  type: "permission.asked",
  properties: {
    tool: "bash" | "read" | "edit" | "webfetch" | "websearch" | "task" | "skill" | "external_directory" | "doom_loop" | object,
    args: { command?: string, filePath?: string, url?: string, uri?: string, query?: string, type?: string, agent?: string, name?: string, skill?: string, path?: string, directory?: string, input?: string },
    metadata?: { command?: string, filepath?: string },
    patterns?: string[],
    permission?: string
  }
}

// 兼容格式（直接传入 Permission 对象时无 tool 字段）
{
  type: "permission.asked",
  tool: { name: "functions.bash:14", callID: "functions.write:19" },
  args: { ... },
  pattern?: string | string[]
}
```

工具名解析规则（优先级从高到低）：
1. `functions.{tool}:{id}` 格式 → 提取 `{tool}`（如 `functions.bash:14` → `bash`）
2. `functions.{tool}` 格式 → 提取 `{tool}`
3. 对象上的 `callID` 字段，先取 `_` 前的 prefix，再按上述规则解析
4. 对象上的 `name` / `tool` / `id` / `type` 字段
5. 字符串直接值

资源提取规则（按 tool 类型分派）：
| Tool | 提取来源（优先级） |
|---|---|
| `bash` | `metadata.command` → `args.command` → `patterns[0]` → 解析为 `{command, args}` |
| `read` / `edit` | `metadata.filepath` → `args.filePath` |
| `webfetch` | `args.url` → `args.uri` |
| `websearch` | `args.query` |
| `task` | `args.type` → `args.agent` |
| `skill` | `args.name` → `args.skill` |
| `external_directory` | `args.path` → `args.directory` |
| `doom_loop` | `args.tool` + `args.input` → `<innerTool>: <input>` |
| fallback | `patterns.join(", ")` → `"unknown"` |

### Question 事件（问答选择）

```ts
{
  type: "question.asked",
  properties: {
    id?: string,           // 去重标识
    projectName?: string,
    questions: Array<{
      question: string,
      header: string,
      options: Array<{ label: string; description: string }>,
      multiple?: boolean,
      custom?: boolean
    }>
  }
}
```

渲染规则：
- **单问题**：`header` 为主题，`question` 为正文，`options` 用 `• label: description` 格式列出
- **多问题**：header 变为 `Multiple Questions (n)`，每个问题带序号内联选项
- **截断保护**：问题文本超 200 字符截断加 `...`；选项超 5 个截断并提示 `... (n more)`
- **提示后缀**：`multiple: true` 时追加 `(可多选)`；`custom: true` 时追加 `(可自定义输入)`
- **空选项时**：模板中的 `Options: {options}` 行应被移除，但问题文本中的 `"Options:"` 字面量必须保留

---

## 需要生成的测试文件

### 文件 1：`tests/permission-mapper.test.ts`

测试 `mapPermissionEvent(event, target, template?)` 函数，覆盖：

1. **bash 命令解析**：`rm -f /tmp/foo.txt` → tool=`bash`, operation=`rm`, resource=`-f /tmp/foo.txt`
2. **自定义模板**：传入 `template` 时正确替换 `{tool}`、`{operation}`、`{resource}`
3. **工具名从对象提取**：`{ name: "bash" }` 解析为 `bash`
4. **`functions.{tool}:{id}` 格式**：`"functions.bash:14"` → `bash`
5. **`functions.{tool}` 无 id 格式**：`"functions.write"` → `write`
6. **对象 name 字段含 functions. 格式**：`{ name: "functions.bash:0" }` → `bash`
7. **OpenCode permission.asked 兼容结构**：无 tool 字符串，有 `permission` + `patterns` + `metadata.filepath`
8. **`callID` 含 functions. 前缀**：`{ callID: "functions.bash:14" }` → `bash`
9. **webfetch URL 提取**：`args.url`
10. **webfetch URI fallback**：无 url 时 fallback 到 uri
11. **websearch query 提取**
12. **task type 提取**
13. **task agent fallback**
14. **skill name 提取**
15. **skill skill 字段 fallback**
16. **external_directory path 提取**
17. **external_directory directory fallback**
18. **doom_loop innerTool + input 拼接**

### 文件 2：`tests/question-mapper.test.ts`

测试 `mapQuestionEvent(event, target, template?)` 函数，覆盖：

1. **单问题完整渲染**：header、question、options 均出现
2. **多问题带序号**：`1. Q1`、`2. Q2` 格式，header 为 `Multiple Questions (2)`
3. **多选提示**：`multiple: true` 时包含 `(可多选)`
4. **自定义输入提示**：`custom: true` 时包含 `(可自定义输入)`
5. **无选项时不显示 Options 行**
6. **问题文本截断**：250 字符问题 → 只显示 200 + `...`
7. **选项截断**：8 个选项 → 显示 5 个 + `... (3 more)`
8. **自定义模板**：传入模板字符串正确替换变量
9. **默认模板渲染**：未传模板时使用默认模板
10. **缺失 projectName 降级为 `unknown`**
11. **user_id target**：target 为 `{ user_id: "ou_1" }` 时正确传递
12. **空 questions 数组**：header 降级为 `"No Questions"`
13. **问题文本含 "Options:" 字面量**：无真实选项时保留字面量，不删除模板行
14. **多问题模式下选项内联**：每个问题下方直接显示选项
15. **多问题模式 custom 无选项**：显示 `(可自定义输入)`

### 文件 3：`tests/event-handler.test.ts`

测试 `createEventHandler(config, notifier, logger)` 的集成行为：

1. **发送 permission 事件**
2. **debounce 去重**：同一事件 1 秒内重复触发只发一次
3. **webfetch 同 URL 去重**
4. **webfetch 不同 URL 不去重**
5. **`functions.{tool}` 格式去重**
6. **主会话 idle 发送 completion**
7. **子会话 idle 不发送 completion**（有 parentID）
8. **子会话 idle 后从 pendingChildren 移除**
9. **多子会话全部 idle 后父会话才发送 completion**
10. **发送 question 事件**
11. **question 按 id 去重**
12. **使用 categories.question.target 配置**

### 文件 4：`tests/index.test.ts`

测试插件入口 `OpenCodeLarkBridge`：

1. **返回包含 event 函数的 hooks 对象**
2. **无配置时 event 为 no-op**
3. **从 `ctx.directory/.opencode/` 加载配置**
4. **暴露 `permission.ask` hook**
5. **暴露 `session.idle` hook**
6. **`session.idle` 发送 completion 通知**
7. **`event` hook 处理真实 OpenCode event shape**
8. **缺失 session title 时 fallback 到 sessionID**
9. **缺失 project name 时 fallback 到 directory basename**
10. **project name 为空字符串时 fallback**
11. **`question.asked` 事件注入 projectName**
12. **`question.asked` 真实 OpenCode shape 注入 projectName**

### 文件 5：`tests/lark-notifier.test.ts`

测试 `createLarkNotifier`：

1. **构建 chat_id 命令**：包含 `lark-cli im +messages-send --chat-id ... --as bot`
2. **错误静默处理**：执行失败时调用 `logger.error` 但不抛异常

---

## 输出要求

对每个测试文件：
1. **先写 import**，必须带 `.js` 扩展名
2. **describe 命名**与源码模块对应
3. **it 描述**用英文，简洁说明测试意图
4. **断言**必须精确验证输出内容（用 `toContain` 验证子串，用 `toBe` 验证精确值）
5. **不省略任何列出的测试场景**
6. **TypeScript 类型正确**，如有需要定义 mock 类型
7. **每个测试独立**，不依赖执行顺序

## 提醒

- 权限事件和问答事件的通知路径是**独立**的，互不影响
- 子代理完成**不得**单独发通知（这是项目反模式）
- 通知失败不得抛异常（使用 try/catch 或 notifier 内部处理）
- 所有降级路径（`unknown`、`fallback`）都要测试到
- `projectName` 注入逻辑在 `index.ts` 中通过 `enhanceEvent` 实现，测试时验证日志输出或 notifier 接收到的消息内容
