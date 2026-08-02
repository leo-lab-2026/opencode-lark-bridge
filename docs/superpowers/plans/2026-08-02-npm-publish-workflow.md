---
change: npm-publish-workflow
design-doc: docs/superpowers/specs/2026-08-02-npm-publish-workflow-design.md
base-ref: c1a3dadd91e04a8d596b8540d845cab3fd32a45d
---
# npm-publish-workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 opencode-lark-bridge 建立完善且可执行的 npm 发布工作流，包含三子命令发布脚本（verify/prepare/release）、双方案发布文档（手动 + 自动化 SOP）与认证安全管理。

**Architecture:** `scripts/publish.sh` 封装确定性发布步骤为三子命令：`verify`（认证 + 构建 + 测试 + pack 预检 + 安装验证）、`prepare --bump <type>`（verify + 版本写入 + tag，不发布）、`release`（npm publish + git push + GitHub Release）。交互步骤（版本选择、最终确认）不写入脚本，由 agent 在 SOP 暂停点处理。`docs/PUBLISH.md` 重写为双方案结构化 SOP 文档。项目级 `.npmrc` 使用 `${NPM_TOKEN}` 占位符注入认证。

**Tech Stack:** Bash（`set -euo pipefail` + `trap ERR`）、npm CLI（`npm publish`/`npm version`/`npm whoami`/`npm pack`）、git、GitHub CLI（`gh release`）

## Global Constraints

- **运行时**: 脚本依赖 bash、npm、git、gh（GitHub Release 可选，不可用时 warn 跳过）
- **安全约束**: 禁止将 `~/.npmrc` 中的明文 authToken 写入任何文件；认证相关只能用环境变量 `NPM_TOKEN` 和 `.npmrc` 占位符 `${NPM_TOKEN}`
- **脚本风格**: `set -euo pipefail`、`PROJECT_ROOT` 模式、`echo` 输出（与现有 `scripts/install-local.sh` 一致，不用颜色）
- **回滚边界**: `release` 的 `npm publish` 成功后不自动回滚（不可逆操作），`prepare` 失败可安全回滚
- **幂等性**: `verify` 可重复执行；`prepare` 重复执行会报错（版本已变更）；`release` 重复会报错（版本已存在）
- **npm version 行为**: 自动更新 `package.json` + git commit + 创建 `v<version>` tag
- **无 CI/CD**: 不引入 GitHub Actions；provenance 仅文档说明未来路径
- **不改动 src/ 运行时逻辑**: 本次仅涉及脚本、文档、配置

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `.npmrc` | 新建 | 项目级 npm 认证配置，`${NPM_TOKEN}` 占位符 |
| `scripts/publish.sh` | 新建 | 三子命令发布脚本：verify/prepare/release + --dry-run + --help |
| `package.json` | 修改 | 新增 `publish:dry` 和 `publish:auto` 脚本入口 |
| `docs/PUBLISH.md` | 重写 | 双方案发布 SOP：手动方案 + 自动化方案 + 认证管理 + 回滚策略 |
| `README.md` | 修改 | 发布章节增加自动化方案说明与 `publish:dry` 引用 |
| `.gitignore` | 确认 | 确认不忽略 `.npmrc`（当前已不忽略，无需改动） |

---

## Task 1: 创建项目级 .npmrc 与 .gitignore 确认

**Files:**
- Create: `.npmrc`
- Verify: `.gitignore`（不修改，仅确认）

**Interfaces:**
- Produces: `.npmrc` 文件，内容为 `//registry.npmjs.org/:_authToken=${NPM_TOKEN}`，供 `scripts/publish.sh` 的 `check_auth` 函数和 `npm publish` 使用

- [ ] **Step 1: 确认 .gitignore 不忽略 .npmrc**

运行：`grep -n "npmrc" .gitignore`
预期：无输出（.gitignore 中无 .npmrc 条目，.npmrc 会被 git 跟踪）

- [ ] **Step 2: 创建 .npmrc 文件**

写入以下内容（仅占位符，不含明文 token）：

```
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

- [ ] **Step 3: 验证 .npmrc 不含明文 token**

运行：`cat .npmrc`
预期输出：`//registry.npmjs.org/:_authToken=${NPM_TOKEN}`（必须看到 `${NPM_TOKEN}` 占位符，而非真实 token 值）

- [ ] **Step 4: 验证 npm 识别占位符**

运行：`NPM_TOKEN=test-placeholder npm config get //registry.npmjs.org/:_authToken`
预期输出：`test-placeholder`（npm 成功从环境变量替换占位符）

- [ ] **Step 5: Commit**

```bash
git add .npmrc
git commit -m "chore: add project-level .npmrc with NPM_TOKEN placeholder"
```

---

## Task 2: 验证 npm whoami 认证可用

**Files:**
- 无文件修改（验证任务）

**Interfaces:**
- Consumes: Task 1 的 `.npmrc`、现有 `~/.npmrc` 明文 token
- Produces: 确认认证可用，后续任务的前提条件

- [ ] **Step 1: 设置 NPM_TOKEN 环境变量**

从 `~/.npmrc` 读取现有 authToken 值（**禁止写入任何文件**），设置为环境变量：

```bash
export NPM_TOKEN=$(grep '_authToken' ~/.npmrc | head -1 | cut -d= -f2 | tr -d ' ')
```

> **安全警告**：此命令仅在当前 shell 会话设置环境变量，不写入任何文件。`~/.npmrc` 中的明文 token 不得出现在 git 提交、计划文档或任何持久化存储中。

- [ ] **Step 2: 验证 npm whoami 通过**

运行：`npm whoami`
预期输出：`leo-lab-2026`

- [ ] **Step 3: 验证项目级 .npmrc 与 NPM_TOKEN 配合工作**

运行：`npm whoami`（在项目根目录，使用项目级 .npmrc + NPM_TOKEN 环境变量）
预期输出：`leo-lab-2026`

- [ ] **Step 4: 无需 commit（验证任务）**

---

## Task 3: 创建 publish.sh 骨架与 verify 子命令

**Files:**
- Create: `scripts/publish.sh`

**Interfaces:**
- Consumes: Task 1 的 `.npmrc`、package.json 现有脚本（`build`/`test`/`pack:dry`/`test:install`）
- Produces: `scripts/publish.sh` 提供 `verify` 子命令和 `--help`，供 Task 4-6 扩展

- [ ] **Step 1: 创建 scripts/publish.sh**

写入以下完整内容：

```bash
#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_NAME="opencode-lark-bridge"
GITHUB_REPO="leo-lab-2026/opencode-lark-bridge"

# 回滚状态跟踪
PREPARED_TAG=""
PUBLISH_DONE=false

# --- 工具函数 ---
info() { echo "[INFO] $1"; }
error() { echo "[ERROR] $1" >&2; }
warn() { echo "[WARN] $1"; }

# --- 认证检查 ---
check_auth() {
    if [ -z "${NPM_TOKEN:-}" ]; then
        error "NPM_TOKEN 环境变量未设置"
        echo ""
        echo "创建 granular automation token 步骤："
        echo "  1. 登录 https://www.npmjs.com -> 头像 -> Access Tokens"
        echo "  2. 创建 Granular Access Token"
        echo "  3. 勾选 bypass 2FA（适用于自动化）"
        echo "  4. 配置 packages 读写权限"
        echo "  5. 导出环境变量：export NPM_TOKEN=<your-token>"
        return 1
    fi

    if ! npm whoami &>/dev/null; then
        error "npm whoami 失败，认证无效"
        echo "请检查 NPM_TOKEN 是否有效，或重新创建 granular automation token"
        return 1
    fi

    info "认证通过：$(npm whoami)"
}

# --- 发布前验证 ---
run_verify() {
    info "执行发布前验证..."
    cd "$PROJECT_ROOT"

    info "[1/4] 构建..."
    npm run build

    info "[2/4] 测试..."
    bun test

    info "[3/4] 包内容预检..."
    npm run pack:dry

    info "[4/4] 安装验证..."
    npm run test:install

    info "发布前验证通过"
}

# --- 回滚清理（Task 4 扩展为完整实现）---
cleanup_on_failure() {
    exit $?
}

# --- 帮助 ---
show_help() {
    cat <<'EOF'
用法: scripts/publish.sh <command> [options]

命令:
  verify                认证检查 + 发布前验证（build + test + pack:dry + test:install）
  prepare --bump <type> verify + 版本写入 + tag 创建（不发布）
  release               npm publish + git push --follow-tags + GitHub Release
  --dry-run             verify + 预览包内容与当前版本号（不发布/不 tag/不推送）
  --help                显示此帮助信息

参数:
  <type>                版本递增类型: patch | minor | major

环境变量:
  NPM_TOKEN             npm granular automation token（必须设置）

示例:
  scripts/publish.sh verify
  scripts/publish.sh prepare --bump patch
  scripts/publish.sh release
  scripts/publish.sh --dry-run
EOF
}

# --- 主入口 ---
trap cleanup_on_failure ERR

case "${1:-}" in
    verify)
        check_auth
        run_verify
        ;;
    --help|-h)
        show_help
        ;;
    "")
        error "未指定命令"
        show_help
        exit 1
        ;;
    *)
        error "未知命令: $1"
        show_help
        exit 1
        ;;
esac
```

- [ ] **Step 2: 设置可执行权限**

运行：`chmod +x scripts/publish.sh`

- [ ] **Step 3: 语法检查**

运行：`bash -n scripts/publish.sh`
预期：无输出（语法正确）

- [ ] **Step 4: 验证 --help 输出**

运行：`bash scripts/publish.sh --help`
预期：显示用法说明，包含所有子命令（verify/prepare/release/--dry-run/--help）

- [ ] **Step 5: 验证未设置 NPM_TOKEN 时 verify 失败**

运行：`env -u NPM_TOKEN bash scripts/publish.sh verify`
预期：输出 `[ERROR] NPM_TOKEN 环境变量未设置` + granular token 创建指引，退出码非零

- [ ] **Step 6: 验证 verify 子命令完整执行**

运行：`NPM_TOKEN=$NPM_TOKEN bash scripts/publish.sh verify`
预期：依次执行 build -> test -> pack:dry -> test:install，全部通过后输出 `发布前验证通过`

- [ ] **Step 7: Commit**

```bash
git add scripts/publish.sh
git commit -m "feat: add publish.sh skeleton with verify subcommand"
```

---

## Task 4: 实现 prepare 子命令与失败回滚清理

**Files:**
- Modify: `scripts/publish.sh` — 替换 `cleanup_on_failure` 空壳为完整实现 + 添加 `run_prepare` 函数 + 添加 `prepare` 参数路由

**Interfaces:**
- Consumes: Task 3 的 `check_auth`、`run_verify`、`show_help`、`trap cleanup_on_failure ERR`
- Produces: `prepare --bump <type>` 子命令，执行 verify + `npm version` + tag 创建；`cleanup_on_failure` 在版本写入后失败时回退 package.json 并删除本地 tag

- [ ] **Step 1: 替换 cleanup_on_failure 为完整实现**

将 `scripts/publish.sh` 中的 `cleanup_on_failure` 函数（Task 3 创建的空壳）：

```bash
cleanup_on_failure() {
    exit $?
}
```

替换为：

```bash
cleanup_on_failure() {
    local exit_code=$?
    if [ "$PUBLISH_DONE" = "true" ]; then
        local version
        version=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
        error "发布后失败（npm 已发布，不可回滚）"
        warn "npm 包已发布: $PACKAGE_NAME@$version"
        warn "手动处理："
        warn "  - 重试失败步骤（git push 或 gh release）"
        warn "  - 或 72h 内执行: npm unpublish $PACKAGE_NAME@$version"
        exit "$exit_code"
    fi
    if [ -n "$PREPARED_TAG" ]; then
        warn "检测到未发布的版本写入，执行回滚..."
        git checkout -- package.json
        git tag -d "$PREPARED_TAG" 2>/dev/null || true
        warn "已回退版本号并删除本地 tag: $PREPARED_TAG"
    fi
    exit "$exit_code"
}
```

- [ ] **Step 2: 添加 run_prepare 函数**

在 `run_verify` 函数之后、`cleanup_on_failure` 之前，添加：

```bash
# --- 版本写入与 tag ---
run_prepare() {
    local bump_type="$1"

    case "$bump_type" in
        patch|minor|major) ;;
        *)
            error "无效的版本递增类型: $bump_type（应为 patch|minor|major）"
            return 1
            ;;
    esac

    # 幂等重跑验证
    run_verify

    info "执行 npm version $bump_type..."
    local old_version
    old_version=$(node -p "require('./package.json').version")
    npm version "$bump_type"
    local new_version
    new_version=$(node -p "require('./package.json').version")

    PREPARED_TAG="v$new_version"

    info "版本写入完成: $old_version -> $new_version (tag: $PREPARED_TAG)"
}
```

- [ ] **Step 3: 添加 prepare 参数路由**

在 `case "${1:-}" in` 块中，在 `verify)` 分支之后、`--help|-h)` 之前，添加：

```bash
    prepare)
        shift
        BUMP_TYPE=""
        while [ $# -gt 0 ]; do
            case "$1" in
                --bump)
                    BUMP_TYPE="${2:-}"
                    if [ -z "$BUMP_TYPE" ]; then
                        error "--bump 需要参数: patch|minor|major"
                        exit 1
                    fi
                    shift 2
                    ;;
                *)
                    error "未知参数: $1"
                    show_help
                    exit 1
                    ;;
            esac
        done
        if [ -z "$BUMP_TYPE" ]; then
            error "prepare 需要 --bump <type> 参数"
            show_help
            exit 1
        fi
        check_auth
        run_prepare "$BUMP_TYPE"
        ;;
```

- [ ] **Step 4: 语法检查**

运行：`bash -n scripts/publish.sh`
预期：无输出

- [ ] **Step 5: 验证无效 bump type 报错**

运行：`bash scripts/publish.sh prepare --bump invalid`
预期：输出 `[ERROR] 无效的版本递增类型: invalid（应为 patch|minor|major）`，退出码非零

- [ ] **Step 6: 验证缺少 --bump 参数报错**

运行：`bash scripts/publish.sh prepare`
预期：输出 `[ERROR] prepare 需要 --bump <type> 参数` + 用法说明，退出码非零

- [ ] **Step 7: 验证 prepare 在临时分支上工作（需要 NPM_TOKEN）**

> 此步骤在临时分支执行，完成后清理，不污染主分支。

```bash
git checkout -b test/prepare-verify
NPM_TOKEN=$NPM_TOKEN bash scripts/publish.sh prepare --bump patch
```

预期：
- 执行 verify（build + test + pack:dry + test:install）
- 执行 `npm version patch`，输出新版本号
- 输出 `版本写入完成: 0.1.1 -> 0.1.2 (tag: v0.1.2)`（版本号可能不同）

验证 package.json 已更新：`node -p "require('./package.json').version"`
验证 tag 已创建：`git tag | grep v0.1.2`（使用实际新版本号）

- [ ] **Step 8: 清理临时分支**

```bash
git tag -d v<new_version>    # 使用 Step 7 实际生成的版本号
git checkout -
git branch -D test/prepare-verify
git checkout -- package.json
```

验证清理完成：`git status`（working tree clean）、`git tag | grep v<new_version>`（无输出）

- [ ] **Step 9: Commit**

```bash
git add scripts/publish.sh
git commit -m "feat: add prepare subcommand and failure rollback cleanup to publish.sh"
```

---

## Task 5: 实现 release 子命令

**Files:**
- Modify: `scripts/publish.sh` — 添加 `run_release` 函数 + 添加 `release` 参数路由

**Interfaces:**
- Consumes: Task 4 的 `PUBLISH_DONE` 变量、`cleanup_on_failure`（release 的 npm publish 成功后 `PUBLISH_DONE=true` 阻止回滚）
- Produces: `release` 子命令，执行 `npm publish` + `git push --follow-tags` + `gh release create`

- [ ] **Step 1: 添加 run_release 函数**

在 `run_prepare` 函数之后、`cleanup_on_failure` 之前，添加：

```bash
# --- 发布与推送 ---
run_release() {
    local version
    version=$(node -p "require('./package.json').version")
    local tag="v$version"

    info "发布 $PACKAGE_NAME@$version 到 npm..."
    npm publish
    PUBLISH_DONE=true

    info "推送代码与标签..."
    git push --follow-tags

    info "创建 GitHub Release..."
    if command -v gh &>/dev/null; then
        gh release create "$tag" --title "$tag" --notes "Release $version"
    else
        warn "gh 命令不可用，跳过 GitHub Release 创建"
        warn "手动执行: gh release create $tag --title $tag --notes 'Release $version'"
    fi

    info "发布完成: $PACKAGE_NAME@$version"
    echo "  npm: https://www.npmjs.com/package/$PACKAGE_NAME/v/$version"
    echo "  GitHub: https://github.com/$GITHUB_REPO/releases/tag/$tag"
}
```

- [ ] **Step 2: 添加 release 参数路由**

在 `case "${1:-}" in` 块中，在 `prepare)` 分支之后、`--help|-h)` 之前，添加：

```bash
    release)
        check_auth
        run_release
        ;;
```

- [ ] **Step 3: 语法检查**

运行：`bash -n scripts/publish.sh`
预期：无输出

- [ ] **Step 4: 验证 --help 包含 release 说明**

运行：`bash scripts/publish.sh --help`
预期：输出中包含 `release               npm publish + git push --follow-tags + GitHub Release`

- [ ] **Step 5: 验证 release 路由可达（不实际发布）**

运行：`env -u NPM_TOKEN bash scripts/publish.sh release`
预期：输出 `[ERROR] NPM_TOKEN 环境变量未设置` + 创建指引，退出码非零（证明路由到达 check_auth）

> release 子命令的完整端到端验证在 Task 10 进行（需要真实发布场景）。

- [ ] **Step 6: Commit**

```bash
git add scripts/publish.sh
git commit -m "feat: add release subcommand to publish.sh"
```

---

## Task 6: 实现 --dry-run 模式

**Files:**
- Modify: `scripts/publish.sh` — 添加 `run_dry_run` 函数 + 添加 `--dry-run` 参数路由

**Interfaces:**
- Consumes: Task 3 的 `check_auth`、`run_verify`
- Produces: `--dry-run` 模式，执行 verify + 预览包内容与版本号，不发布/不 tag/不推送

- [ ] **Step 1: 添加 run_dry_run 函数**

在 `run_release` 函数之后、`cleanup_on_failure` 之前，添加：

```bash
# --- dry-run 预览模式 ---
run_dry_run() {
    check_auth
    run_verify

    local version
    version=$(node -p "require('./package.json').version")
    echo ""
    echo "=== 预览 ==="
    echo "当前版本: $version"
    echo "包名: $PACKAGE_NAME"
    echo ""
    info "包内容（npm pack --dry-run）："
    npm pack --dry-run
}
```

- [ ] **Step 2: 添加 --dry-run 参数路由**

在 `case "${1:-}" in` 块中，在 `release)` 分支之后、`--help|-h)` 之前，添加：

```bash
    --dry-run)
        run_dry_run
        ;;
```

- [ ] **Step 3: 语法检查**

运行：`bash -n scripts/publish.sh`
预期：无输出

- [ ] **Step 4: 验证 --dry-run 不产生副作用（需要 NPM_TOKEN）**

运行：`NPM_TOKEN=$NPM_TOKEN bash scripts/publish.sh --dry-run`
预期：
- 执行 verify（build + test + pack:dry + test:install）
- 输出 `=== 预览 ===` + 当前版本号 + 包名
- 输出 `npm pack --dry-run` 的包内容列表
- **不创建 git tag**：`git tag --list 'v*' | tail -5` 无新增
- **不修改 package.json**：`git diff package.json` 无输出

- [ ] **Step 5: Commit**

```bash
git add scripts/publish.sh
git commit -m "feat: add --dry-run mode to publish.sh"
```

---

## Task 7: 新增 package.json 脚本入口

**Files:**
- Modify: `package.json:38-47`（scripts 对象）

**Interfaces:**
- Consumes: Task 3-6 的 `scripts/publish.sh` 完整实现
- Produces: `npm run publish:dry` 和 `npm run publish:auto` 两个 npm 脚本入口

- [ ] **Step 1: 在 package.json scripts 中添加 publish:dry 和 publish:auto**

在 `package.json` 的 `scripts` 对象中，在 `"test:install"` 之后添加两个新脚本：

将：
```json
    "test:install": "bash scripts/test-install.sh",
    "postinstall": "node -e \"if (require('fs').existsSync('./dist/postinstall.js')) require('child_process').execFileSync(process.execPath, ['./dist/postinstall.js'], {stdio: 'inherit'})\""
```

改为：
```json
    "test:install": "bash scripts/test-install.sh",
    "publish:dry": "bash scripts/publish.sh --dry-run",
    "publish:auto": "bash scripts/publish.sh",
    "postinstall": "node -e \"if (require('fs').existsSync('./dist/postinstall.js')) require('child_process').execFileSync(process.execPath, ['./dist/postinstall.js'], {stdio: 'inherit'})\""
```

> **说明**：`publish:auto` 调用 `scripts/publish.sh`（无参数），需配合 `--bump <type>` 参数由 agent 在暂停确认后传入。`npm run publish:auto` 不带参数会输出用法说明。

- [ ] **Step 2: 验证 package.json JSON 合法**

运行：`node -e "require('./package.json'); console.log('JSON valid')"`
预期输出：`JSON valid`

- [ ] **Step 3: 验证 npm run publish:dry 可调用**

运行：`NPM_TOKEN=$NPM_TOKEN npm run publish:dry`
预期：与 Task 6 Step 4 相同的输出（verify + 预览包内容）

- [ ] **Step 4: 验证 npm run publish:auto 无参数时输出用法**

运行：`npm run publish:auto`
预期：输出 `[ERROR] 未指定命令` + 用法说明，退出码非零

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "feat: add publish:dry and publish:auto npm scripts"
```

---

## Task 8: 重写 docs/PUBLISH.md 为双方案发布文档

**Files:**
- Rewrite: `docs/PUBLISH.md`（覆盖现有内容）

**Interfaces:**
- Consumes: Task 1-7 的完整实现（.npmrc、publish.sh、package.json 脚本）
- Produces: 双方案发布 SOP 文档，覆盖手动方案、自动化方案、认证管理、版本管理、回滚策略、provenance、npm 官方流程依据

- [ ] **Step 1: 重写 docs/PUBLISH.md**

用以下完整内容覆盖 `docs/PUBLISH.md`：

````markdown
# 发布流程

本文档描述 opencode-lark-bridge npm 包的发布流程，提供手动与自动化两套方案。

## 概述

本项目提供两种发布路径：

- **手动发布方案**：开发者按文档步骤手动执行每条命令，适用于调试或特殊场景。
- **自动化发布方案**：在 OpenCode agent 会话中发出触发短语，agent 读取本文档并按 SOP 调用 `scripts/publish.sh` 执行，在版本号决策点和最终发布确认点暂停等待用户输入。

两种方案的步骤一致，自动化方案额外定义触发短语、暂停点与 agent 执行指引。

## 发布前检查清单

以下检查在两种方案中均需通过（`scripts/publish.sh verify` 自动执行）：

- [ ] `NPM_TOKEN` 环境变量已设置
- [ ] `npm whoami` 验证认证身份通过
- [ ] `npm run build` 编译无错误
- [ ] `bun test` 全部测试通过
- [ ] `npm run pack:dry` 包内容只含 `files` 声明的文件
- [ ] `npm run test:install` 本地安装验证通过

## 手动发布方案

### 前置：设置 NPM_TOKEN

项目级 `.npmrc` 使用 `${NPM_TOKEN}` 占位符，所有发布均需设置环境变量：

```bash
export NPM_TOKEN=<your-granular-token>
npm whoami  # 验证认证，预期输出 leo-lab-2026
```

### 1. 确认工作区干净

```bash
git status
```

预期：working tree clean。如有未提交更改，先处理。

### 2. 发布前验证

```bash
bash scripts/publish.sh verify
```

预期：依次执行认证检查 -> build -> test -> pack:dry -> test:install，全部通过后输出 `发布前验证通过`。

任一失败则中止，修复后重试。

### 3. 更新版本号

```bash
npm version patch  # 或 minor / major
```

此命令会：
- 更新 `package.json` 的 `version` 字段
- 创建 git commit（message 为版本号）
- 创建 git tag（格式 `v<version>`）

**SemVer 递增规则**：
- `patch`：bug 修复（0.1.0 -> 0.1.1）
- `minor`：向后兼容的新功能（0.1.0 -> 0.2.0）
- `major`：不兼容变更（0.1.0 -> 1.0.0）

失败处理：若 `npm version` 失败，package.json 未变更，直接重试。

### 4. 发布到 npm

```bash
npm publish
```

`prepublishOnly` 脚本会自动执行 build + test。

预期：发布成功，输出包 URL。

失败处理：若 `npm publish` 失败，npm 上不会有该版本。修复后重新执行 `npm publish`。版本号和 tag 已创建（步骤 3），无需重新 `npm version`。

### 5. 推送代码和标签

```bash
git push --follow-tags
```

预期：代码和版本标签推送到远程仓库。

失败处理：若推送失败但 npm 已发布，**不要回滚 npm**（已发布不可撤回）。修复网络或权限问题后重试 `git push --follow-tags`。

### 6. 创建 GitHub Release

```bash
gh release create v<version> --title "v<version>" --notes "Release <version>"
```

预期：从刚推送的 tag 创建 GitHub Release。

失败处理：不影响 npm 发布。手动重试即可。

## 自动化发布方案

### 触发短语

在 OpenCode agent 会话中输入：

> 按流程文档自动发布到 npm

或等价表述（如"发布新版本到 npm"）。

### 前置条件

- `NPM_TOKEN` 环境变量已设置（granular automation token）
- 工作区干净（无未提交更改）
- 远程仓库可推送

### SOP 步骤

agent 读取本章节后，按以下步骤执行：

1. **调用 verify**：执行 `bash scripts/publish.sh verify`
   - 脚本自动检查认证 + build + test + pack:dry + test:install
   - 失败则中止，报告失败原因

2. **【暂停点 A】版本号决策**：agent 暂停并询问用户：
   > 发布前验证通过。请选择版本递增类型：
   > - patch（bug 修复）
   > - minor（向后兼容的新功能）
   > - major（不兼容变更）

   用户确认 patch/minor/major 后继续。

3. **调用 prepare**：执行 `bash scripts/publish.sh prepare --bump <type>`
   - 脚本自动执行 verify（幂等重跑）+ `npm version <type>` + 创建 tag
   - 失败则自动回滚（回退版本号、删除本地 tag），报告失败原因

4. **【暂停点 B】最终发布确认**：agent 暂停并展示：
   > 即将发布版本：v<version>
   > 包内容已通过验证。
   > 确认发布？(yes/no)

   用户确认后继续。

5. **调用 release**：执行 `bash scripts/publish.sh release`
   - 脚本自动执行 `npm publish` + `git push --follow-tags` + `gh release create`
   - `npm publish` 成功后不回滚（不可逆操作）
   - 后续步骤失败则提示手动处理

6. **报告结果**：agent 输出：
   - npm 包 URL：`https://www.npmjs.com/package/opencode-lark-bridge/v/<version>`
   - GitHub Release URL：`https://github.com/leo-lab-2026/opencode-lark-bridge/releases/tag/v<version>`

### Agent 执行指引

- agent 不直接执行 npm/git 命令，而是调用 `scripts/publish.sh` 子命令
- 交互步骤（版本选择、最终确认）在 SOP 暂停点由 agent 向用户询问
- `scripts/publish.sh` 的 `--help` 可查看所有子命令
- `npm run publish:dry` 可用于预演（等价于 `scripts/publish.sh --dry-run`）

## 认证管理

### Granular Automation Token 创建

1. 登录 [npmjs.com](https://www.npmjs.com) -> 头像 -> Access Tokens
2. 点击 **Create New Token** -> 选择 **Granular Access Token**
3. 配置：
   - Token name: `opencode-lark-bridge-publish`
   - Expiration: 按需设置
   - Packages and scopes: 选择 `Read and write`
   - 勾选 **bypass 2FA**（适用于自动化发布）
4. 创建后复制 token（仅显示一次）
5. 导出环境变量：
   ```bash
   export NPM_TOKEN=<your-token>
   ```
   建议添加到 shell 配置文件（`~/.bashrc` / `~/.zshrc`）。

### NPM_TOKEN 注入

项目级 `.npmrc` 使用占位符：

```
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

npm 在读取 `.npmrc` 时，会将 `${NPM_TOKEN}` 替换为环境变量 `NPM_TOKEN` 的值。

### npm whoami 验证

发布前执行 `npm whoami` 验证当前认证身份：

```bash
npm whoami
```

预期输出：`leo-lab-2026`（或你的 npm 用户名）。

### 禁止明文存储

- **禁止**在 `.npmrc`、文档或任何文件中写入明文 token
- **禁止**将 `NPM_TOKEN` 的值提交到 git
- `.npmrc` 只能包含 `${NPM_TOKEN}` 占位符
- 现有 `~/.npmrc` 的明文 token 可继续用于不使用项目级 `.npmrc` 的场景，建议迁移到 granular token + 环境变量方式

### 2FA 说明

- granular automation token 勾选 bypass 2FA 后，发布时无需输入 2FA 验证码
- 手动发布时若启用了 2FA，`npm publish` 会提示输入验证码
- 启用 2FA（推荐）：`npm profile enable-2fa`

## 版本管理

遵循语义化版本（SemVer 2.0.0）：

| 递增类型 | 适用场景 | 示例 |
|---------|---------|------|
| `patch` | bug 修复 | 0.1.0 -> 0.1.1 |
| `minor` | 向后兼容的新功能 | 0.1.0 -> 0.2.0 |
| `major` | 不兼容的变更 | 0.1.0 -> 1.0.0 |

版本号写入与 tag：

```bash
npm version <type>
```

此命令会更新 `package.json` 的 `version` 字段，并创建格式为 `v<version>` 的 git tag。

## 回滚策略

### 72 小时内回滚

发布后 72 小时内发现严重问题需撤回：

```bash
npm unpublish opencode-lark-bridge@<version>
```

npm 限制发布 72 小时后不可 unpublish。

### 72 小时后回滚

发布超过 72 小时后发现严重问题：

1. `git revert` 回退变更
2. 发布递增 patch 的修复版本

## 供应链安全（provenance）

npm provenance（SLSA 供应链来源声明）提供包的构建来源证明，增强供应链安全。

### 当前状态

暂不启用。provenance 需要 GitHub Actions OIDC 环境，项目当前无 CI/CD，本地发布无法生成 provenance。

### 未来接入路径

1. 配置 GitHub Actions workflow
2. 在 workflow 中设置 `NPM_TOKEN` 和 OIDC 权限
3. 发布时添加 `--provenance` 参数：
   ```bash
   npm publish --provenance
   ```

参考：[npm provenance 文档](https://docs.npmjs.com/generating-provenance-statements)

## npm 官方流程依据

本文档基于 npm 官方发布流程，引用以下关键命令与文档：

| 命令 | 用途 | 官方文档 |
|------|------|---------|
| `npm publish` | 发布包到 npm registry | [npm publish](https://docs.npmjs.com/cli/v10/commands/npm-publish) |
| `npm version` | 更新版本号并创建 git tag | [npm version](https://docs.npmjs.com/cli/v10/commands/npm-version) |
| `npm whoami` | 验证当前认证身份 | [npm whoami](https://docs.npmjs.com/cli/v10/commands/npm-whoami) |
| `npm token create` | 创建 access token | [npm token](https://docs.npmjs.com/cli/v10/commands/npm-token) |
| `npm profile enable-2fa` | 启用双因素认证 | [npm profile](https://docs.npmjs.com/cli/v10/commands/npm-profile) |
| `npm unpublish` | 撤回已发布的包（72h 内） | [npm unpublish](https://docs.npmjs.com/cli/v10/commands/npm-unpublish) |
| `npm dist-tag` | 管理 dist-tags | [npm dist-tag](https://docs.npmjs.com/cli/v10/commands/npm-dist-tag) |
| `--access` | 控制包可见性（public/private） | [npm publish --access](https://docs.npmjs.com/cli/v10/commands/npm-publish#access) |
| `--provenance` | 生成供应链来源声明 | [npm provenance](https://docs.npmjs.com/generating-provenance-statements) |
````

- [ ] **Step 2: 验证文档章节完整性**

对照以下章节清单逐项确认 `docs/PUBLISH.md` 包含：
1. 概述（双方案并存说明）
2. 发布前检查清单（6 项检查）
3. 手动发布方案（6 步操作，每步含命令/预期/失败处理）
4. 自动化发布方案（触发短语/前置条件/6 步 SOP/2 个暂停点/agent 执行指引）
5. 认证管理（granular token 创建/NPM_TOKEN 注入/npm whoami/禁止明文/2FA）
6. 版本管理（SemVer 递增规则表）
7. 回滚策略（72h 内 unpublish / 72h 后 revert+patch）
8. 供应链安全 provenance（当前状态/未来路径）
9. npm 官方流程依据（命令表 + 官方文档链接）

- [ ] **Step 3: Commit**

```bash
git add docs/PUBLISH.md
git commit -m "docs: rewrite PUBLISH.md with dual-track publish workflow (manual + automated SOP)"
```

---

## Task 9: 更新 README 发布链接

**Files:**
- Modify: `README.md:312-314`（发布章节）

**Interfaces:**
- Consumes: Task 8 的 `docs/PUBLISH.md` 双方案文档
- Produces: README 发布章节增加自动化方案说明与 `publish:dry` 引用

- [ ] **Step 1: 更新 README 发布章节**

将 `README.md` 中的：

```markdown
## 发布

若要自行发布此包，请参考 [docs/PUBLISH.md](./docs/PUBLISH.md)。
```

替换为：

```markdown
## 发布

本项目支持手动与自动化两种发布方案。详细流程参见 [docs/PUBLISH.md](./docs/PUBLISH.md)。

- **手动发布**：按 `docs/PUBLISH.md` 手动发布方案章节执行
- **自动化发布**：在 OpenCode agent 会话中输入"按流程文档自动发布到 npm"，agent 按 SOP 自动执行

发布前预演验证：

```bash
npm run publish:dry  # 验证 + 预览包内容，不发布
```
```

- [ ] **Step 2: 验证 README 渲染正确**

运行：`grep -A 10 "## 发布" README.md`
预期：输出包含 `docs/PUBLISH.md` 链接、手动/自动化方案说明、`publish:dry` 命令

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README with dual-track publish workflow reference"
```

---

## Task 10: npm run publish:dry 端到端验证

**Files:**
- 无文件修改（验证任务）

**Interfaces:**
- Consumes: Task 1-7 的完整实现（.npmrc、publish.sh、package.json 脚本）
- Produces: 确认 `npm run publish:dry` 端到端正常执行

- [ ] **Step 1: 确认 NPM_TOKEN 已设置**

运行：`echo ${NPM_TOKEN:+set}`
预期输出：`set`

- [ ] **Step 2: 运行 npm run publish:dry**

运行：`npm run publish:dry`
预期：
- 执行认证检查（输出 `[INFO] 认证通过：leo-lab-2026`）
- 执行 build（输出 `[INFO] [1/4] 构建...`）
- 执行 test（输出 `[INFO] [2/4] 测试...`）
- 执行 pack:dry（输出 `[INFO] [3/4] 包内容预检...`）
- 执行 test:install（输出 `[INFO] [4/4] 安装验证...`）
- 输出 `=== 预览 ===` + 当前版本号 + 包名
- 输出 `npm pack --dry-run` 的包内容列表

- [ ] **Step 3: 验证无副作用**

运行：`git status`
预期：working tree clean（dry-run 不产生任何副作用）

运行：`git tag --list 'v*' | tail -3`
预期：无新增 tag

- [ ] **Step 4: 无需 commit（验证任务）**

---

## Task 11: docs/PUBLISH.md 完整性校验

**Files:**
- 无文件修改（验证任务）

**Interfaces:**
- Consumes: Task 8 的 `docs/PUBLISH.md`、delta spec 验收场景
- Produces: 确认文档章节完整，对照 spec 验收场景逐项确认

- [ ] **Step 1: 校验 npm-publish-workflow spec 验收场景**

对照 `openspec/changes/npm-publish-workflow/specs/npm-publish-workflow/spec.md` 的以下场景：

| 场景 | 验证方法 |
|------|---------|
| 手动发布完整路径 | 确认 PUBLISH.md 手动方案覆盖：工作区检查 -> 验证 -> npm version -> npm publish -> git push --follow-tags -> GitHub Release |
| 手动发布引用 npm 官方流程 | 确认 PUBLISH.md 包含命令表：npm publish/version/whoami/token/profile enable-2fa/--access/--provenance/dist-tags + 官方文档链接 |
| 自动化发布触发 | 确认 PUBLISH.md 自动化方案定义触发短语"按流程文档自动发布到 npm" |
| 版本号决策点暂停 | 确认 SOP 步骤 2 标记【暂停点 A】版本号决策 |
| 最终发布确认点暂停 | 确认 SOP 步骤 4 标记【暂停点 B】最终发布确认 |
| 自动化方案与手动方案并存 | 确认 PUBLISH.md 同时包含手动方案章节与自动化方案章节 |
| 三子命令接口与暂停点映射 | 确认 publish.sh 提供 verify/prepare/release 三子命令；SOP 在 verify 后暂停、prepare 后最终确认、确认后调用 release |
| release 阶段 npm publish 成功后不自动回滚 | 确认 publish.sh 的 cleanup_on_failure 检查 PUBLISH_DONE，npm publish 成功后不回滚 |
| 认证通过环境变量注入 | 确认 .npmrc 使用 `${NPM_TOKEN}` 占位符 |
| 发布前认证检查 | 确认 publish.sh verify 执行 npm whoami |
| 未配置 NPM_TOKEN 的指引 | 确认 check_auth 输出 granular token 创建步骤 |
| SemVer 递增规则 | 确认 PUBLISH.md 版本管理章节定义 patch/minor/major 规则 |
| 版本号写入与 tag | 确认 npm version 创建 `v<version>` 格式 tag |
| 推送代码与标签 | 确认 release 执行 git push --follow-tags |
| 创建 GitHub Release | 确认 release 执行 gh release create |
| 72 小时内回滚 | 确认 PUBLISH.md 回滚策略包含 npm unpublish |
| 72 小时后回滚 | 确认 PUBLISH.md 回滚策略包含 git revert + patch |
| provenance 状态说明 | 确认 PUBLISH.md 说明 provenance 需 GitHub Actions OIDC，暂不启用 |

- [ ] **Step 2: 校验 npm-publish-preparation spec 验收场景**

对照 `openspec/changes/npm-publish-workflow/specs/npm-publish-preparation/spec.md` 的以下场景：

| 场景 | 验证方法 |
|------|---------|
| 文档存在且内容完整 | 确认 PUBLISH.md 包含：发布前检查清单、手动发布方案、自动化发布方案、认证管理、供应链安全、npm 官方流程依据 |
| 自动化方案章节存在 | 确认 PUBLISH.md 自动化方案章节定义触发短语、前置条件、执行步骤序列、两个暂停点、agent 执行指引 |
| 认证管理章节存在 | 确认 PUBLISH.md 认证管理章节说明 granular token 创建、NPM_TOKEN 注入、npm whoami 验证、禁止明文存储 |
| README 链接发布文档 | 确认 README.md 包含指向 docs/PUBLISH.md 的链接 |

- [ ] **Step 3: 无需 commit（验证任务）**

---

## Task 12: tsc 类型检查与 bun test 回归

**Files:**
- 无文件修改（验证任务）

**Interfaces:**
- Consumes: Task 7 的 package.json 改动
- Produces: 确认 package.json 改动后无类型错误，现有功能不受影响

- [ ] **Step 1: 运行 tsc 类型检查**

运行：`npm run build`
预期：编译成功，无类型错误，无输出（tsc 静默成功）

- [ ] **Step 2: 运行 bun test 全量测试**

运行：`bun test`
预期：所有测试通过，无失败

- [ ] **Step 3: 无需 commit（验证任务）**

---

## Self-Review

### Spec 覆盖检查

| Spec 需求 | 覆盖任务 |
|-----------|---------|
| 手动发布工作流 | Task 8（PUBLISH.md 手动方案章节） |
| 自动化发布工作流（触发短语/暂停点/SOP） | Task 8（PUBLISH.md 自动化方案章节） |
| 发布脚本确定性执行（三子命令） | Task 3-6（publish.sh verify/prepare/release/--dry-run） |
| 发布认证管理（granular token/NPM_TOKEN/npm whoami） | Task 1（.npmrc）、Task 3（check_auth）、Task 8（认证管理章节） |
| 版本管理与 SemVer | Task 4（npm version）、Task 8（版本管理章节） |
| 发布后推送与 GitHub Release | Task 5（run_release）、Task 8（手动方案步骤 5-6） |
| 发布失败回滚策略 | Task 4（cleanup_on_failure）、Task 8（回滚策略章节） |
| 供应链安全 provenance 说明 | Task 8（provenance 章节） |
| npm script 入口 | Task 7（publish:dry/publish:auto） |
| README 链接 | Task 9 |
| 失败回滚清理（trap ERR） | Task 4（cleanup_on_failure 完整实现） |
| npm publish 成功后不自动回滚 | Task 5（PUBLISH_DONE=true）、Task 4（cleanup 检查 PUBLISH_DONE） |

### tasks.md 映射检查

| tasks.md 任务 | 计划任务 |
|---------------|---------|
| 1.1 创建 .npmrc | Task 1 |
| 1.2 验证 npm whoami | Task 2 |
| 2.1 脚本骨架 | Task 3 |
| 2.2 认证检查函数 | Task 3（check_auth） |
| 2.3 发布前验证函数 | Task 3（run_verify） |
| 2.4 版本写入与 tag | Task 4（run_prepare） |
| 2.5 发布与推送函数 | Task 5（run_release） |
| 2.6 --dry-run 模式 | Task 6（run_dry_run） |
| 2.7 --bump 完整模式 | Task 4 + Task 5（prepare + release 串联，验证在 Task 10） |
| 2.8 失败回滚清理 | Task 4（cleanup_on_failure） |
| 3.1 package.json 脚本入口 | Task 7 |
| 4.1 文档结构 | Task 8 |
| 4.2 手动发布方案 | Task 8 |
| 4.3 自动化发布方案 | Task 8 |
| 4.4 认证管理 | Task 8 |
| 4.5 版本/回滚/provenance/官方依据 | Task 8 |
| 5.1 README 链接 | Task 9 |
| 6.1 publish:dry 验证 | Task 10 |
| 6.2 文档完整性校验 | Task 11 |
| 6.3 tsc + bun test 回归 | Task 12 |

### 占位符扫描

- 无 "TBD"/"TODO"/"implement later" — 通过
- 所有代码步骤包含完整代码块 — 通过
- 所有验证步骤包含具体命令与预期输出 — 通过
- PUBLISH.md 完整内容在 Task 8 中提供 — 通过

### 类型一致性

- `PREPARED_TAG` 在 Task 3 声明、Task 4 赋值、cleanup 读取 — 一致
- `PUBLISH_DONE` 在 Task 3 声明、Task 5 赋值为 true、cleanup 读取 — 一致
- `run_verify` 在 Task 3 定义、Task 4 的 `run_prepare` 调用、Task 6 的 `run_dry_run` 调用 — 一致
- `check_auth` 在 Task 3 定义、Task 4/5/6 调用 — 一致
