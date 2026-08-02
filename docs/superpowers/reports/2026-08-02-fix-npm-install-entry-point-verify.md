# 验证报告：fix-npm-install-entry-point

**日期：** 2026-08-02
**Change：** fix-npm-install-entry-point
**验证模式：** light（覆盖自动评估的 full，实际实现改动仅 4 文件，其余 12 个为 openspec/comet 元数据）
**审查模式：** off（hotfix 默认，跳过自动代码审查）

---

## 轻量验证 6 项检查

| # | 检查项 | 结果 | 证据 |
|---|-------|------|------|
| 1 | tasks.md 全部任务已完成 `[x]` | PASS | 6/6 任务已勾选 |
| 2 | 改动文件与 tasks.md 描述一致 | PASS | 4 个实现文件：package.json、install-local.sh、install-global.sh、tests/installer.test.ts |
| 3 | 编译通过 | PASS | `npm run build`（tsc）exit 0，无输出 |
| 4 | 相关测试通过 | PASS | `bun test`：153 pass, 0 fail, 321 expect() calls |
| 5 | 无明显安全问题 | PASS | 改动为路径字符串和复制命令参数，无硬编码密钥、无 unsafe 操作 |
| 6 | 代码审查策略 | SKIP | `review_mode: off`，hotfix 默认跳过自动代码审查 |

---

## 回归测试证据（RED -> GREEN）

### RED（修复前）

新增 2 个回归测试，修复前均失败：

1. `main field points to a file that exists in the published package structure`
   - `main: "./index.js"` -> `<repo>/index.js` 不存在 -> FAIL
2. `main field resolves to existing file after copyPluginFiles (npm install structure)`
   - `copyPluginFiles` 产出 `dist/index.js`（嵌套），`main: "./index.js"` 解析到根级 -> 不存在 -> FAIL

### GREEN（修复后）

两个测试均通过：`main: "./dist/index.js"` -> `dist/index.js` 存在 -> PASS

---

## 根因确认

opencode 插件加载源码（`packages/opencode/src/plugin/shared.ts`）：

1. `resolvePathPluginTarget` - 路径型 spec 解析为目录 URL（含 `package.json` 时返回目录）
2. `resolvePackageEntrypoint` - 读取 `package.json` 的 `main` 字段，解析为绝对路径（**不检查文件是否存在**）
3. `PluginLoader.load` - `await import(row.entry)` - 文件不存在时 import 抛异常，插件加载失败

**修复前**：`main: "./index.js"` + npm 安装结构（`dist/index.js` 嵌套）-> `import()` 失败 -> 插件不加载 -> 无通知
**修复后**：`main: "./dist/index.js"` + 统一嵌套结构 -> `import()` 成功 -> 插件加载 -> 通知正常

---

## npm 包结构验证

`npm pack --dry-run` 确认：
- `dist/index.js` 在发布包中
- `main: "./dist/index.js"` 指向存在的文件
- 无根级 `index.js`（符合预期，入口在 `dist/` 子目录）

---

## 结论

6 项检查全部 PASS（第 6 项 SKIP），无 CRITICAL 或 IMPORTANT 问题。验证通过。
