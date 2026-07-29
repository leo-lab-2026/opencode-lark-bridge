---
change: install-local-config-registration
design-doc: docs/superpowers/specs/2026-07-28-install-local-config-registration-design.md
base-ref: 53093f2
---
# install-local.sh 智能配置注册 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `scripts/install-local.sh` 在安装后自动检测 opencode 主配置文件是否已注册本插件，未注册时按优先级写入项目级配置文件，全程不污染全局配置、不阻塞安装。

**Architecture:** 将配置检查与写入逻辑抽取到独立可 source 的 `scripts/lib/config-register.sh`（仅定义函数与常量，无副作用），`install-local.sh` source 后调用入口函数 `register_plugin_config`。检查层用 jq 精确解析（不可用时 grep 回退），写入层纯 sed/awk 定点修改以保留注释。测试用自包含 bash 脚本 `tests/install-local.test.sh`（无 bats 依赖，subshell 隔离 + 断言 exit 1 失败）。

**Tech Stack:** Bash（POSIX + GNU sed/awk）、jq（可选，mise 管理）、mktemp/grep/sed/awk（必需）

## Global Constraints

- 运行时：`scripts/install-local.sh` 顶部 `set -euo pipefail`，被 source 的 lib 函数须在该模式下安全运行（条件上下文 + `|| true` 兜底）
- 写入不依赖 jq：全部用 sed/awk 定点修改，保留 JSONC 注释与原有字段
- 全局配置（`~/.config/opencode/`）只读检查，**禁止写入**
- 项目级配置优先级：`.opencode/opencode.jsonc` > `.opencode/opencode.json` > `./opencode.jsonc` > `./opencode.json`
- 写入类型偏好：优先 jsonc；都不存在则创建 `.opencode/opencode.jsonc`
- 容错：检查/写入失败输出警告并继续，**不得中断安装主流程**（`install-local.sh` 中调用形如 `register_plugin_config || true`）
- JSONC 注释剥离仅处理 `//` 单行注释，不处理 `/* */` 块注释（opencode 配置极少使用，见 Design Doc §2）
- 测试通过 `mise use jq@latest` 安装 jq 以覆盖精确检查路径；用 `JQ_BIN=__nojq__` 强制 grep 回退路径
- 测试运行：`bash tests/install-local.test.sh`，退出码 0 表示全过
- 路径常量 `PLUGIN_PATH=".opencode/plugins/opencode-lark-bridge"`（相对项目根，install-local.sh 已 `cd` 到项目根）
- 已知边界（接受）：单行配置文件 `{...}` 全在一行时场景 2 插入可能异常；数组元素带行内尾随注释时逗号追加可能误伤——opencode 配置实际为多行无尾随注释，风险可接受

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `scripts/lib/config-register.sh` | 新建 | 仅定义函数与常量，无顶层副作用；`strip_jsonc_comments`/`is_plugin_registered`/`check_all_configs`/`select_write_target`/`write_plugin_registration`/`register_plugin_config` |
| `scripts/install-local.sh` | 修改 | source lib + 在种子配置步骤后调用 `register_plugin_config \|\| true` |
| `tests/install-local.test.sh` | 新建 | bash 测试脚本：断言工具 + 沙箱 + 各场景测试函数 |
| `README.md` | 修改 | 说明安装脚本自动注册行为 |

---

### Task 1: Scaffold + JSONC 注释剥离函数（TDD）

**Files:**
- Create: `scripts/lib/config-register.sh`
- Create: `tests/install-local.test.sh`

**Interfaces:**
- Produces: `strip_jsonc_comments`（stdin→stdout 剥离 `//` 注释）、常量 `PLUGIN_PATH`、`GLOBAL_CONFIGS`/`PROJECT_CONFIGS` 数组、测试断言工具集
- Consumes: 无

- [x] **Step 1: 安装 jq（测试用，mise 管理）**

Run: `mise use jq@latest`
Expected: jq 安装成功，`mise which jq` 输出路径

- [x] **Step 2: 创建 lib 骨架（仅常量，函数待 TDD 补全）**

Create `scripts/lib/config-register.sh`:

```bash
#!/usr/bin/env bash
# Config registration helpers for install-local.sh.
# Source-only: defines functions and constants, no side effects on source.

# Plugin path as stored in opencode config (relative to project root).
PLUGIN_PATH="${PLUGIN_PATH:-.opencode/plugins/opencode-lark-bridge}"

# Global opencode configs (read-only check only).
GLOBAL_CONFIGS=(
  "$HOME/.config/opencode/opencode.jsonc"
  "$HOME/.config/opencode/opencode.json"
)

# Project-level configs (check + write), ordered by priority.
PROJECT_CONFIGS=(
  ".opencode/opencode.jsonc"
  ".opencode/opencode.json"
  "opencode.jsonc"
  "opencode.json"
)
```

- [x] **Step 3: 创建测试脚手架（断言 + 沙箱 + run_test）**

Create `tests/install-local.test.sh`:

```bash
#!/usr/bin/env bash
# Bash test suite for scripts/lib/config-register.sh (no bats dependency).
# Run: bash tests/install-local.test.sh
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=../scripts/lib/config-register.sh
source "$SCRIPT_DIR/scripts/lib/config-register.sh"

PASS=0
FAIL=0
SKIP=0
FAILED_TESTS=()

assert_eq() {
  if [ "$1" = "$2" ]; then return 0; fi
  echo "    ASSERT FAIL: expected [$1] got [$2]" >&2
  exit 1
}

assert_contains() {
  if echo "$1" | grep -qF "$2"; then return 0; fi
  echo "    ASSERT FAIL: expected [$2] in [$1]" >&2
  exit 1
}

assert_not_contains() {
  if ! echo "$1" | grep -qF "$2"; then return 0; fi
  echo "    ASSERT FAIL: expected [$2] NOT in [$1]" >&2
  exit 1
}

assert_file_contains() {
  if grep -qF "$2" "$1" 2>/dev/null; then return 0; fi
  echo "    ASSERT FAIL: expected [$2] in file [$1]" >&2
  exit 1
}

assert_file_not_contains() {
  if ! grep -qF "$2" "$1" 2>/dev/null; then return 0; fi
  echo "    ASSERT FAIL: expected [$2] NOT in file [$1]" >&2
  exit 1
}

assert_exit() {
  local expected="$1"; shift
  local code
  "$@" >/dev/null 2>&1; code=$?
  if [ "$code" = "$expected" ]; then return 0; fi
  echo "    ASSERT FAIL: expected exit $expected, got $code" >&2
  exit 1
}

# Sandbox: create temp project root + temp HOME, cd into project root.
# Must run inside a subshell (run_test wraps tests in subshells).
sandbox_setup() {
  TEST_SANDBOX="$(mktemp -d)" || exit 1
  export HOME="$TEST_SANDBOX/home"
  mkdir -p "$HOME/.config/opencode"
  mkdir -p "$TEST_SANDBOX/project/.opencode/plugins/opencode-lark-bridge"
  cd "$TEST_SANDBOX/project" || exit 1
  trap 'rm -rf "$TEST_SANDBOX"' EXIT
}

run_test() {
  local name="$1"; shift
  local out
  out=$( "$@" 2>&1 )
  local code=$?
  if [ "$code" = "0" ]; then
    echo "  PASS: $name"
    PASS=$((PASS+1))
  elif [ "$code" = "77" ]; then
    echo "  SKIP: $name"
    SKIP=$((SKIP+1))
  else
    echo "  FAIL: $name"
    echo "$out" | sed 's/^/    /' >&2
    FAIL=$((FAIL+1))
    FAILED_TESTS+=("$name")
  fi
}

skip_if_no_jq() {
  if ! command -v jq &> /dev/null; then
    echo "    (jq not installed)"
    exit 77
  fi
}

# ===== Tests =====

# (Task 1 adds strip_jsonc_comments tests here)

# ===== Main =====

# (run_test calls added per task)

echo ""
echo "Results: PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
if [ "$FAIL" -ne 0 ]; then
  echo "Failed tests: ${FAILED_TESTS[*]}"
  exit 1
fi
exit 0
```

- [x] **Step 4: 写 strip_jsonc_comments 的失败测试**

Append to `tests/install-local.test.sh`（在 `# ===== Main =====` 之前插入测试函数，并在 Main 区块添加 run_test 调用）:

测试函数（插入 `# ===== Tests =====` 下方）:

```bash
test_strip_pure_comment_line() {
  sandbox_setup
  local out
  out=$(echo '// just a comment' | strip_jsonc_comments)
  assert_eq "" "$out"
}

test_strip_trailing_comment() {
  sandbox_setup
  local out
  out=$(echo '"a": 1 // trailing' | strip_jsonc_comments)
  assert_eq '"a": 1 ' "$out"
}

test_strip_preserves_url_in_string() {
  sandbox_setup
  local out
  out=$(echo '"url": "https://example.com" // link' | strip_jsonc_comments)
  assert_contains "$out" '"https://example.com"'
  assert_not_contains "$out" '// link'
}

test_strip_preserves_double_slash_in_string() {
  sandbox_setup
  local out
  out=$(echo '"path": "// not a comment"' | strip_jsonc_comments)
  assert_contains "$out" '// not a comment'
}

test_strip_preserves_code_without_comment() {
  sandbox_setup
  local out
  out=$(echo '{"a": 1, "b": 2}' | strip_jsonc_comments)
  assert_eq '{"a": 1, "b": 2}' "$out"
}
```

Main 区块添加（在 `echo ""` 之前）:

```bash
run_test "strip: pure comment line" test_strip_pure_comment_line
run_test "strip: trailing comment" test_strip_trailing_comment
run_test "strip: preserves URL in string" test_strip_preserves_url_in_string
run_test "strip: preserves // in string" test_strip_preserves_double_slash_in_string
run_test "strip: no comment unchanged" test_strip_preserves_code_without_comment
```

- [x] **Step 5: 运行测试确认失败**

Run: `bash tests/install-local.test.sh`
Expected: FAIL — `strip_jsonc_comments: command not found`（函数尚未定义）

- [x] **Step 6: 实现 strip_jsonc_comments**

Append to `scripts/lib/config-register.sh`（在常量定义之后）:

```bash
# Strip // line comments outside of double-quoted strings (stdin -> stdout).
# Does NOT handle /* */ block comments (opencode configs rarely use them).
strip_jsonc_comments() {
  awk '
  {
    out = ""
    in_str = 0
    i = 1
    line = $0
    while (i <= length(line)) {
      c = substr(line, i, 1)
      if (c == "\"" && (i == 1 || substr(line, i-1, 1) != "\\")) {
        in_str = !in_str
        out = out c
        i++
        continue
      }
      if (!in_str && c == "/" && i < length(line) && substr(line, i+1, 1) == "/") {
        break
      }
      out = out c
      i++
    }
    print out
  }'
}
```

- [x] **Step 7: 运行测试确认通过**

Run: `bash tests/install-local.test.sh`
Expected: PASS=5 FAIL=0

- [x] **Step 8: Commit**

```bash
git add scripts/lib/config-register.sh tests/install-local.test.sh
git commit -m "feat: add config-register lib scaffold + strip_jsonc_comments"
```

---

### Task 2: 插件注册检查函数 is_plugin_registered（TDD）

**Files:**
- Modify: `scripts/lib/config-register.sh`（追加 `is_plugin_registered`）
- Modify: `tests/install-local.test.sh`（追加测试）

**Interfaces:**
- Produces: `is_plugin_registered <file>` → 返回 0=已注册，1=未注册（含解析失败，附 stderr 警告）
- Consumes: `strip_jsonc_comments`、`PLUGIN_PATH`、`JQ_BIN`（默认 `jq`，测试可覆盖以强制 grep 回退）

- [x] **Step 1: 写失败测试**

追加测试函数到 `tests/install-local.test.sh`:

```bash
test_registered_jq_mode() {
  skip_if_no_jq
  sandbox_setup
  local f=".opencode/opencode.jsonc"
  printf '{\n  "plugin": ["%s"]\n}\n' "$PLUGIN_PATH" > "$f"
  assert_exit 0 is_plugin_registered "$f"
}

test_not_registered_jq_mode() {
  skip_if_no_jq
  sandbox_setup
  local f=".opencode/opencode.jsonc"
  printf '{\n  "plugin": ["other-plugin"]\n}\n' > "$f"
  assert_exit 1 is_plugin_registered "$f"
}

test_registered_jsonc_with_comments_jq() {
  skip_if_no_jq
  sandbox_setup
  local f=".opencode/opencode.jsonc"
  cat > "$f" <<EOF
{
  // registered plugins
  "plugin": [
    "$PLUGIN_PATH"
  ]
}
EOF
  assert_exit 0 is_plugin_registered "$f"
}

test_no_plugin_field_jq() {
  skip_if_no_jq
  sandbox_setup
  local f=".opencode/opencode.jsonc"
  printf '{\n  "theme": "dark"\n}\n' > "$f"
  assert_exit 1 is_plugin_registered "$f"
}

test_nonexistent_file() {
  sandbox_setup
  assert_exit 1 is_plugin_registered ".opencode/nope.jsonc"
}

test_registered_grep_fallback() {
  sandbox_setup
  local f=".opencode/opencode.jsonc"
  printf '{\n  "plugin": ["%s"]\n}\n' "$PLUGIN_PATH" > "$f"
  JQ_BIN="__nojq__" assert_exit 0 is_plugin_registered "$f"
}

test_not_registered_grep_fallback() {
  sandbox_setup
  local f=".opencode/opencode.jsonc"
  printf '{\n  "plugin": ["other"]\n}\n' > "$f"
  JQ_BIN="__nojq__" assert_exit 1 is_plugin_registered "$f"
}

test_malformed_json_warns_jq() {
  skip_if_no_jq
  sandbox_setup
  local f=".opencode/opencode.jsonc"
  printf '{ broken json }}}' > "$f"
  local err
  err=$(is_plugin_registered "$f" 2>&1 >/dev/null) || true
  assert_contains "$err" "WARNING"
  assert_exit 1 is_plugin_registered "$f"
}

test_registered_absolute_path_jq() {
  skip_if_no_jq
  sandbox_setup
  local f=".opencode/opencode.jsonc"
  local abs="/abs/path$PLUGIN_PATH"
  printf '{\n  "plugin": ["%s"]\n}\n' "$abs" > "$f"
  assert_exit 0 is_plugin_registered "$f"
}
```

Main 区块追加:

```bash
run_test "is_registered: jq mode registered" test_registered_jq_mode
run_test "is_registered: jq mode not registered" test_not_registered_jq_mode
run_test "is_registered: jq mode jsonc with comments" test_registered_jsonc_with_comments_jq
run_test "is_registered: jq mode no plugin field" test_no_plugin_field_jq
run_test "is_registered: nonexistent file" test_nonexistent_file
run_test "is_registered: grep fallback registered" test_registered_grep_fallback
run_test "is_registered: grep fallback not registered" test_not_registered_grep_fallback
run_test "is_registered: malformed json warns jq" test_malformed_json_warns_jq
run_test "is_registered: jq endswith absolute path" test_registered_absolute_path_jq
```

- [x] **Step 2: 运行测试确认失败**

Run: `bash tests/install-local.test.sh`
Expected: 新增 9 个 FAIL（`is_plugin_registered: command not found`）

- [x] **Step 3: 实现 is_plugin_registered**

追加到 `scripts/lib/config-register.sh`:

```bash
# Check if PLUGIN_PATH is registered in the given config file.
# Returns: 0 = registered, 1 = not registered (or unparseable).
# Uses jq for precise check when available; falls back to grep.
# Override JQ_BIN to force a mode (used by tests).
is_plugin_registered() {
  local file="$1"
  [ ! -f "$file" ] && return 1

  local jq_bin="${JQ_BIN:-jq}"
  if command -v "$jq_bin" &> /dev/null; then
    local code
    strip_jsonc_comments < "$file" | "$jq_bin" -e --arg p "$PLUGIN_PATH" \
      '.plugin // [] | any(. == $p or endswith($p))' >/dev/null 2>/dev/null
    code=${PIPESTATUS[1]:-$?}
    if [ "$code" -eq 0 ]; then
      return 0
    elif [ "$code" -eq 1 ]; then
      return 1
    else
      echo "WARNING: Failed to parse $file (jq exit $code), skipping" >&2
      return 1
    fi
  else
    grep -qF "$PLUGIN_PATH" "$file" 2>/dev/null && return 0 || return 1
  fi
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `bash tests/install-local.test.sh`
Expected: PASS=14 FAIL=0（5 旧 + 9 新）

- [x] **Step 5: Commit**

```bash
git add scripts/lib/config-register.sh tests/install-local.test.sh
git commit -m "feat: add is_plugin_registered with jq + grep fallback"
```

---

### Task 3: 全量扫描函数 check_all_configs（TDD）

**Files:**
- Modify: `scripts/lib/config-register.sh`（追加 `check_all_configs`）
- Modify: `tests/install-local.test.sh`（追加测试）

**Interfaces:**
- Produces: `check_all_configs` → 返回 0=任一文件已注册（stdout 打印位置），1=全部未注册
- Consumes: `is_plugin_registered`、`GLOBAL_CONFIGS`、`PROJECT_CONFIGS`

- [x] **Step 1: 写失败测试**

追加测试函数:

```bash
test_check_all_project_registered() {
  skip_if_no_jq
  sandbox_setup
  printf '{\n  "plugin": ["%s"]\n}\n' "$PLUGIN_PATH" > ".opencode/opencode.jsonc"
  local out
  out=$(check_all_configs) || true
  assert_contains "$out" "already registered"
  assert_contains "$out" ".opencode/opencode.jsonc"
  assert_exit 0 check_all_configs
}

test_check_all_global_registered() {
  skip_if_no_jq
  sandbox_setup
  printf '{\n  "plugin": ["%s"]\n}\n' "$PLUGIN_PATH" > "$HOME/.config/opencode/opencode.jsonc"
  local out
  out=$(check_all_configs) || true
  assert_contains "$out" "already registered"
  assert_exit 0 check_all_configs
}

test_check_all_none_registered() {
  skip_if_no_jq
  sandbox_setup
  printf '{\n  "plugin": ["other"]\n}\n' > ".opencode/opencode.json"
  assert_exit 1 check_all_configs
}

test_check_all_no_files() {
  sandbox_setup
  assert_exit 1 check_all_configs
}

test_check_all_global_never_written() {
  skip_if_no_jq
  sandbox_setup
  # Even if global is unregistered, check returns 1 (not registered) — write never targets global
  printf '{\n  "plugin": ["other"]\n}\n' > "$HOME/.config/opencode/opencode.json"
  assert_exit 1 check_all_configs
  assert_file_not_contains "$HOME/.config/opencode/opencode.json" "$PLUGIN_PATH"
}
```

Main 区块追加:

```bash
run_test "check_all: project registered" test_check_all_project_registered
run_test "check_all: global registered" test_check_all_global_registered
run_test "check_all: none registered" test_check_all_none_registered
run_test "check_all: no files exist" test_check_all_no_files
run_test "check_all: global never written" test_check_all_global_never_written
```

- [x] **Step 2: 运行测试确认失败**

Run: `bash tests/install-local.test.sh`
Expected: 新增 5 个 FAIL（`check_all_configs: command not found`）

- [x] **Step 3: 实现 check_all_configs**

追加到 `scripts/lib/config-register.sh`:

```bash
# Scan all global + project configs. Returns 0 if plugin is registered
# in any of them (prints location to stdout), 1 if not registered anywhere.
check_all_configs() {
  local cfg
  for cfg in "${GLOBAL_CONFIGS[@]}"; do
    if is_plugin_registered "$cfg"; then
      echo "Plugin already registered in global config: $cfg"
      return 0
    fi
  done
  for cfg in "${PROJECT_CONFIGS[@]}"; do
    if is_plugin_registered "$cfg"; then
      echo "Plugin already registered in project config: $cfg"
      return 0
    fi
  done
  return 1
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `bash tests/install-local.test.sh`
Expected: PASS=19 FAIL=0

- [x] **Step 5: Commit**

```bash
git add scripts/lib/config-register.sh tests/install-local.test.sh
git commit -m "feat: add check_all_configs scanner"
```

---

### Task 4: 写入目标选择函数 select_write_target（TDD）

**Files:**
- Modify: `scripts/lib/config-register.sh`（追加 `select_write_target`）
- Modify: `tests/install-local.test.sh`（追加测试）

**Interfaces:**
- Produces: `select_write_target` → stdout 输出目标文件路径（相对 CWD）
- Consumes: 无（硬编码优先级顺序）

- [x] **Step 1: 写失败测试**

追加测试函数:

```bash
test_select_prefers_opencode_jsonc() {
  sandbox_setup
  touch ".opencode/opencode.jsonc" "opencode.jsonc" ".opencode/opencode.json"
  assert_eq ".opencode/opencode.jsonc" "$(select_write_target)"
}

test_select_prefers_root_jsonc_over_opencode_json() {
  sandbox_setup
  touch "opencode.jsonc" ".opencode/opencode.json"
  assert_eq "opencode.jsonc" "$(select_write_target)"
}

test_select_falls_back_to_json() {
  sandbox_setup
  touch ".opencode/opencode.json"
  assert_eq ".opencode/opencode.json" "$(select_write_target)"
}

test_select_json_priority_opencode_over_root() {
  sandbox_setup
  touch "opencode.json"
  assert_eq "opencode.json" "$(select_write_target)"
  # but .opencode/opencode.json wins over root opencode.json
  touch ".opencode/opencode.json"
  assert_eq ".opencode/opencode.json" "$(select_write_target)"
}

test_select_default_when_none_exist() {
  sandbox_setup
  assert_eq ".opencode/opencode.jsonc" "$(select_write_target)"
}
```

Main 区块追加:

```bash
run_test "select: prefers .opencode/opencode.jsonc" test_select_prefers_opencode_jsonc
run_test "select: root jsonc over opencode json" test_select_prefers_root_jsonc_over_opencode_json
run_test "select: falls back to json" test_select_falls_back_to_json
run_test "select: json priority opencode over root" test_select_json_priority_opencode_over_root
run_test "select: default when none exist" test_select_default_when_none_exist
```

- [x] **Step 2: 运行测试确认失败**

Run: `bash tests/install-local.test.sh`
Expected: 新增 5 个 FAIL

- [x] **Step 3: 实现 select_write_target**

追加到 `scripts/lib/config-register.sh`:

```bash
# Choose the config file to write to, by priority:
#   .opencode/opencode.jsonc > opencode.jsonc
#   .opencode/opencode.json  > opencode.json
# If none exist, return ".opencode/opencode.jsonc" (to be created).
select_write_target() {
  local cfg
  for cfg in ".opencode/opencode.jsonc" "opencode.jsonc"; do
    [ -f "$cfg" ] && echo "$cfg" && return
  done
  for cfg in ".opencode/opencode.json" "opencode.json"; do
    [ -f "$cfg" ] && echo "$cfg" && return
  done
  echo ".opencode/opencode.jsonc"
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `bash tests/install-local.test.sh`
Expected: PASS=24 FAIL=0

- [x] **Step 5: Commit**

```bash
git add scripts/lib/config-register.sh tests/install-local.test.sh
git commit -m "feat: add select_write_target priority selector"
```

---

### Task 5: write_plugin_registration 场景 1 & 2（新建文件 / 添加 plugin 字段）（TDD）

**Files:**
- Modify: `scripts/lib/config-register.sh`（追加 `write_plugin_registration` 的场景 1、2）
- Modify: `tests/install-local.test.sh`（追加测试）

**Interfaces:**
- Produces: `write_plugin_registration <target>` → 返回 0 成功，1 失败（附 stderr 警告）
- Consumes: `PLUGIN_PATH`

- [x] **Step 1: 写失败测试（场景 1：新建文件）**

追加测试函数:

```bash
test_write_creates_new_file() {
  sandbox_setup
  local target=".opencode/opencode.jsonc"
  rm -f "$target"
  write_plugin_registration "$target"
  assert_file_contains "$target" '"$schema": "https://opencode.ai/config.json"'
  assert_file_contains "$target" "\"$PLUGIN_PATH\""
  assert_file_contains "$target" '"plugin"'
}

test_write_creates_parent_dir() {
  sandbox_setup
  rm -rf ".opencode"
  write_plugin_registration ".opencode/opencode.jsonc"
  assert_file_contains ".opencode/opencode.jsonc" '"plugin"'
}
```

- [x] **Step 2: 写失败测试（场景 2：无 plugin 字段）**

追加测试函数:

```bash
test_write_adds_plugin_field_preserving_comments() {
  sandbox_setup
  local target=".opencode/opencode.jsonc"
  cat > "$target" <<'EOF'
{
  // my theme
  "theme": "dark",
  "model": "gpt-4"
}
EOF
  write_plugin_registration "$target"
  assert_file_contains "$target" "// my theme"
  assert_file_contains "$target" '"theme": "dark"'
  assert_file_contains "$target" '"plugin"'
  assert_file_contains "$target" "\"$PLUGIN_PATH\""
}

test_write_adds_plugin_field_to_nested_config() {
  sandbox_setup
  local target=".opencode/opencode.jsonc"
  cat > "$target" <<'EOF'
{
  "nested": {
    "a": 1
  }
}
EOF
  write_plugin_registration "$target"
  assert_file_contains "$target" '"plugin"'
  assert_file_contains "$target" "\"$PLUGIN_PATH\""
  assert_file_contains "$target" '"a": 1'
}

test_write_skips_non_json_file() {
  sandbox_setup
  local target=".opencode/opencode.jsonc"
  printf 'not json at all' > "$target"
  local err
  err=$(write_plugin_registration "$target" 2>&1 >/dev/null) || true
  assert_contains "$err" "WARNING"
}
```

Main 区块追加:

```bash
run_test "write: creates new file with schema+plugin" test_write_creates_new_file
run_test "write: creates parent dir" test_write_creates_parent_dir
run_test "write: adds plugin field preserving comments" test_write_adds_plugin_field_preserving_comments
run_test "write: adds plugin field to nested config" test_write_adds_plugin_field_to_nested_config
run_test "write: skips non-json file" test_write_skips_non_json_file
```

- [x] **Step 3: 运行测试确认失败**

Run: `bash tests/install-local.test.sh`
Expected: 新增 5 个 FAIL

- [x] **Step 4: 实现 write_plugin_registration（场景 1 & 2）**

追加到 `scripts/lib/config-register.sh`:

```bash
# Write plugin registration into target config file.
# Scenarios: 1) create new file, 2) no plugin field, 3) empty array,
# 4) non-empty array (append). Preserves comments via sed/awk.
# Returns 0 on success, 1 on failure (with stderr warning).
write_plugin_registration() {
  local target="$1"

  # Scenario 1: file does not exist -> create
  if [ ! -f "$target" ]; then
    mkdir -p "$(dirname "$target")"
    cat > "$target" <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": [
    "$PLUGIN_PATH"
  ]
}
EOF
    echo "Created config with plugin registration: $target"
    return 0
  fi

  # Structural guard: must contain { and }
  if ! grep -q '{' "$target" || ! grep -q '}' "$target"; then
    echo "WARNING: $target does not look like a valid JSON config, skipping write" >&2
    return 1
  fi

  # Scenario 2: no "plugin" field -> insert before last closing }
  if ! grep -q '"plugin"' "$target"; then
    local last_brace
    last_brace=$(grep -n '}' "$target" | tail -1 | cut -d: -f1)
    if [ -z "$last_brace" ]; then
      echo "WARNING: Could not find insertion point in $target" >&2
      return 1
    fi
    sed -i.bak "${last_brace}i\\
  \"plugin\": [\"$PLUGIN_PATH\"]," "$target"
    rm -f "$target.bak"
    echo "Added plugin field to: $target"
    return 0
  fi

  # Scenarios 3 & 4 are implemented in Task 6.
  echo "WARNING: plugin field exists but append logic not yet implemented for $target" >&2
  return 1
}
```

- [x] **Step 5: 运行测试确认通过**

Run: `bash tests/install-local.test.sh`
Expected: PASS=29 FAIL=0（场景 1、2 的 5 个新测试通过）

- [x] **Step 6: Commit**

```bash
git add scripts/lib/config-register.sh tests/install-local.test.sh
git commit -m "feat: write_plugin_registration scenarios 1 (new file) & 2 (add field)"
```

---

### Task 6: write_plugin_registration 场景 3 & 4（空数组 / 非空数组追加）（TDD）

**Files:**
- Modify: `scripts/lib/config-register.sh`（替换场景 3、4 占位逻辑）
- Modify: `tests/install-local.test.sh`（追加测试）

**Interfaces:**
- Produces: 同 Task 5（补全场景 3、4）
- Consumes: `PLUGIN_PATH`

- [x] **Step 1: 写失败测试（场景 3：空数组）**

追加测试函数:

```bash
test_write_empty_array_single_line() {
  sandbox_setup
  local target=".opencode/opencode.jsonc"
  cat > "$target" <<'EOF'
{
  "plugin": []
}
EOF
  write_plugin_registration "$target"
  assert_file_contains "$target" "\"$PLUGIN_PATH\""
  assert_file_not_contains "$target" "[]"
}

test_write_empty_array_with_spaces() {
  sandbox_setup
  local target=".opencode/opencode.jsonc"
  printf '{\n  "plugin": [ ]\n}\n' > "$target"
  write_plugin_registration "$target"
  assert_file_contains "$target" "\"$PLUGIN_PATH\""
}
```

- [x] **Step 2: 写失败测试（场景 4：非空数组追加）**

追加测试函数:

```bash
test_write_append_single_line_array() {
  sandbox_setup
  local target=".opencode/opencode.jsonc"
  printf '{\n  "plugin": ["other"]\n}\n' > "$target"
  write_plugin_registration "$target"
  assert_file_contains "$target" '"other"'
  assert_file_contains "$target" "\"$PLUGIN_PATH\""
  assert_contains "$(cat "$target")" '"other", "'
}

test_write_append_single_line_multi_element() {
  sandbox_setup
  local target=".opencode/opencode.jsonc"
  printf '{\n  "plugin": ["a", "b"]\n}\n' > "$target"
  write_plugin_registration "$target"
  assert_file_contains "$target" '"a"'
  assert_file_contains "$target" '"b"'
  assert_file_contains "$target" "\"$PLUGIN_PATH\""
}

test_write_append_multiline_array() {
  sandbox_setup
  local target=".opencode/opencode.jsonc"
  cat > "$target" <<'EOF'
{
  "plugin": [
    "other"
  ]
}
EOF
  write_plugin_registration "$target"
  assert_file_contains "$target" '"other"'
  assert_file_contains "$target" "\"$PLUGIN_PATH\""
  # ensure comma added before new element
  assert_file_contains "$target" '"other",'
}

test_write_append_multiline_preserves_comments() {
  sandbox_setup
  local target=".opencode/opencode.jsonc"
  cat > "$target" <<'EOF'
{
  // plugins list
  "plugin": [
    "other"
  ],
  "theme": "dark"
}
EOF
  write_plugin_registration "$target"
  assert_file_contains "$target" "// plugins list"
  assert_file_contains "$target" '"theme": "dark"'
  assert_file_contains "$target" "\"$PLUGIN_PATH\""
}

test_write_append_trailing_comma_style() {
  sandbox_setup
  local target=".opencode/opencode.jsonc"
  cat > "$target" <<'EOF'
{
  "plugin": [
    "other",
  ]
}
EOF
  write_plugin_registration "$target"
  assert_file_contains "$target" "\"$PLUGIN_PATH\""
  assert_file_contains "$target" '"other",'
}
```

Main 区块追加:

```bash
run_test "write: empty array single line" test_write_empty_array_single_line
run_test "write: empty array with spaces" test_write_empty_array_with_spaces
run_test "write: append single-line array" test_write_append_single_line_array
run_test "write: append single-line multi-element" test_write_append_single_line_multi_element
run_test "write: append multiline array" test_write_append_multiline_array
run_test "write: append multiline preserves comments" test_write_append_multiline_preserves_comments
run_test "write: append trailing-comma style" test_write_append_trailing_comma_style
```

- [x] **Step 3: 运行测试确认失败**

Run: `bash tests/install-local.test.sh`
Expected: 新增 7 个 FAIL（场景 3、4 占位逻辑返回 WARNING）

- [x] **Step 4: 实现场景 3 & 4**

替换 `write_plugin_registration` 末尾的占位块（`# Scenarios 3 & 4 are implemented in Task 6.` 那段）为:

```bash
  # Scenario 3: empty array [] (single-line, possibly with spaces)
  if grep -qE '"plugin"[[:space:]]*:[[:space:]]*\[[[:space:]]*\]' "$target"; then
    sed -i.bak -E "s|(\"plugin\"[[:space:]]*:[[:space:]]*\[)[[:space:]]*\]|\\1\"$PLUGIN_PATH\"]|g" "$target"
    rm -f "$target.bak"
    echo "Added plugin to empty array in: $target"
    return 0
  fi

  # Scenario 4: non-empty array -> append
  # Sub-case 4a: single-line array "plugin": ["a", ...]
  if grep -qE '"plugin"[[:space:]]*:[[:space:]]*\[.*\]' "$target"; then
    sed -i.bak -E "s|(\"plugin\"[[:space:]]*:[[:space:]]*\[[[:space:]]*[^]]*[^[:space:]])([[:space:]]*\])|\\1, \"$PLUGIN_PATH\"\\2|" "$target"
    rm -f "$target.bak"
    echo "Appended plugin to single-line array in: $target"
    return 0
  fi

  # Sub-case 4b: multi-line array — locate closing ] on its own line
  local close_line
  close_line=$(awk '
    /"plugin"[[:space:]]*:/ { found=1 }
    found && /\]/ { print NR; exit }
  ' "$target")
  if [ -z "$close_line" ]; then
    echo "WARNING: Could not locate plugin array closing bracket in $target" >&2
    return 1
  fi

  # Find last non-blank line before close_line (the last element)
  local last_elem_line=$((close_line - 1))
  while [ "$last_elem_line" -gt 0 ]; do
    local content
    content=$(sed -n "${last_elem_line}p" "$target")
    [ -n "$(printf '%s' "$content" | tr -d '[:space:]')" ] && break
    last_elem_line=$((last_elem_line - 1))
  done

  # Add trailing comma to last element if missing (replaces trailing whitespace)
  local last_content
  last_content=$(sed -n "${last_elem_line}p" "$target")
  if ! printf '%s' "$last_content" | grep -qE ',[[:space:]]*$'; then
    sed -i.bak -E "${last_elem_line}s|[[:space:]]*$|,|" "$target"
    rm -f "$target.bak"
  fi

  # Indentation matching the last element
  local indent
  indent=$(sed -n "${last_elem_line}p" "$target" | awk '{ match($0, /^[[:space:]]*/); print substr($0, 1, RLENGTH) }')

  # Insert new element before closing ]
  sed -i.bak "${close_line}i\\
${indent}\"$PLUGIN_PATH\"" "$target"
  rm -f "$target.bak"
  echo "Appended plugin to multi-line array in: $target"
  return 0
}
```

- [x] **Step 5: 运行测试确认通过**

Run: `bash tests/install-local.test.sh`
Expected: PASS=36 FAIL=0

- [x] **Step 6: Commit**

```bash
git add scripts/lib/config-register.sh tests/install-local.test.sh
git commit -m "feat: write_plugin_registration scenarios 3 (empty array) & 4 (append)"
```

---

### Task 7: 编排函数 register_plugin_config + 容错（TDD）

**Files:**
- Modify: `scripts/lib/config-register.sh`（追加 `register_plugin_config`）
- Modify: `tests/install-local.test.sh`（追加端到端编排测试）

**Interfaces:**
- Produces: `register_plugin_config` → 编排 check → select → write；返回 0 已注册或写入成功，1 写入失败（附提示）
- Consumes: `check_all_configs`、`select_write_target`、`write_plugin_registration`

- [x] **Step 1: 写失败测试（端到端场景）**

追加测试函数:

```bash
test_orchestrate_skips_when_already_registered() {
  skip_if_no_jq
  sandbox_setup
  printf '{\n  "plugin": ["%s"]\n}\n' "$PLUGIN_PATH" > ".opencode/opencode.jsonc"
  local out
  out=$(register_plugin_config) || true
  assert_contains "$out" "already registered"
}

test_orchestrate_creates_when_none_exist() {
  sandbox_setup
  register_plugin_config
  assert_file_contains ".opencode/opencode.jsonc" "\"$PLUGIN_PATH\""
}

test_orchestrate_writes_to_existing_jsonc() {
  skip_if_no_jq
  sandbox_setup
  cat > ".opencode/opencode.jsonc" <<'EOF'
{
  // existing
  "theme": "dark"
}
EOF
  register_plugin_config
  assert_file_contains ".opencode/opencode.jsonc" "// existing"
  assert_file_contains ".opencode/opencode.jsonc" "\"$PLUGIN_PATH\""
}

test_orchestrate_writes_to_json_when_no_jsonc() {
  skip_if_no_jq
  sandbox_setup
  printf '{\n  "theme": "dark"\n}\n' > "opencode.json"
  register_plugin_config
  assert_file_contains "opencode.json" "\"$PLUGIN_PATH\""
  assert_file_not_contains "opencode.json" "// existing"
  # should NOT have created jsonc
  [ ! -f ".opencode/opencode.jsonc" ] || exit 1
}

test_orchestrate_never_modifies_global() {
  skip_if_no_jq
  sandbox_setup
  printf '{\n  "plugin": ["other"]\n}\n' > "$HOME/.config/opencode/opencode.json"
  register_plugin_config
  assert_file_not_contains "$HOME/.config/opencode/opencode.json" "$PLUGIN_PATH"
  assert_file_contains ".opencode/opencode.jsonc" "$PLUGIN_PATH"
}

test_orchestrate_idempotent() {
  skip_if_no_jq
  sandbox_setup
  register_plugin_config
  local before
  before=$(cat ".opencode/opencode.jsonc")
  register_plugin_config
  local after
  after=$(cat ".opencode/opencode.jsonc")
  assert_eq "$before" "$after"
}

test_orchestrate_write_failure_warns_not_aborts() {
  sandbox_setup
  # Make write target directory read-only so creation fails
  mkdir -p ".opencode"
  chmod 555 ".opencode"
  local err
  err=$(register_plugin_config 2>&1) || true
  chmod 755 ".opencode"
  assert_contains "$err" "WARNING"
}
```

Main 区块追加:

```bash
run_test "orchestrate: skips when already registered" test_orchestrate_skips_when_already_registered
run_test "orchestrate: creates when none exist" test_orchestrate_creates_when_none_exist
run_test "orchestrate: writes to existing jsonc" test_orchestrate_writes_to_existing_jsonc
run_test "orchestrate: writes to json when no jsonc" test_orchestrate_writes_to_json_when_no_jsonc
run_test "orchestrate: never modifies global" test_orchestrate_never_modifies_global
run_test "orchestrate: idempotent" test_orchestrate_idempotent
run_test "orchestrate: write failure warns not aborts" test_orchestrate_write_failure_warns_not_aborts
```

- [x] **Step 2: 运行测试确认失败**

Run: `bash tests/install-local.test.sh`
Expected: 新增 7 个 FAIL（`register_plugin_config: command not found`）

- [x] **Step 3: 实现 register_plugin_config**

追加到 `scripts/lib/config-register.sh`:

```bash
# Orchestrate: check all configs -> if not registered, select target -> write.
# Best-effort: returns 0 if already registered or write succeeded, 1 on write
# failure (caller should use `register_plugin_config || true` to stay non-blocking).
register_plugin_config() {
  if check_all_configs; then
    return 0
  fi

  local target
  target=$(select_write_target)

  if ! write_plugin_registration "$target"; then
    echo "WARNING: Failed to write plugin registration to $target" >&2
    echo "         Please manually add '$PLUGIN_PATH' to your opencode config." >&2
    return 1
  fi
  return 0
}
```

- [x] **Step 4: 运行测试确认通过**

Run: `bash tests/install-local.test.sh`
Expected: PASS=43 FAIL=0

- [x] **Step 5: Commit**

```bash
git add scripts/lib/config-register.sh tests/install-local.test.sh
git commit -m "feat: add register_plugin_config orchestrator with fault tolerance"
```

---

### Task 8: 集成到 install-local.sh + 端到端验证

**Files:**
- Modify: `scripts/install-local.sh`

**Interfaces:**
- Consumes: `register_plugin_config` from `scripts/lib/config-register.sh`

- [x] **Step 1: 修改 install-local.sh**

在 `scripts/install-local.sh` 末尾的 `echo "Plugin installed to $PLUGIN_DIR"` 之前（即种子配置块之后）插入:

```bash
# Register plugin in opencode main config (best-effort, non-blocking).
# Source-only lib: defines functions/constants, no side effects on source.
# shellcheck source=lib/config-register.sh
source "$PROJECT_ROOT/scripts/lib/config-register.sh"
register_plugin_config || true
```

完整修改后的 `scripts/install-local.sh` 末尾应为:

```bash
# Seed project-level config at .opencode root on first install; preserve user edits on subsequent runs.
mkdir -p "$PROJECT_ROOT/.opencode"
if [ ! -f "$PROJECT_CONFIG" ]; then
  cp "$SOURCE_DIR/$EXAMPLE_FILE" "$PROJECT_CONFIG"
  echo "Created example config at $PROJECT_CONFIG"
else
  echo "Preserved existing config at $PROJECT_CONFIG"
fi

# Register plugin in opencode main config (best-effort, non-blocking).
# shellcheck source=lib/config-register.sh
source "$PROJECT_ROOT/scripts/lib/config-register.sh"
register_plugin_config || true

echo "Plugin installed to $PLUGIN_DIR"
```

- [x] **Step 2: 运行完整测试套件**

Run: `bash tests/install-local.test.sh`
Expected: PASS=43 FAIL=0

- [x] **Step 3: 端到端手动验证（场景：无配置文件 → 自动创建）**

Run:
```bash
# 准备干净临时项目目录
E2E=$(mktemp -d)
mkdir -p "$E2E/.opencode"
# 复制当前仓库以便 build
cp -r /home/lifxu/src/opencode-lark-bridge "$E2E/repo"
# 在临时项目目录模拟运行（仅测试 config-register 部分，跳过 build）
cd "$E2E/repo"
# 模拟 install-local.sh 的注册段
source "$E2E/repo/scripts/lib/config-register.sh"
cd "$E2E"  # 切到无配置的项目目录
register_plugin_config
cat "$E2E/.opencode/opencode.jsonc"
```
Expected: 输出包含 `$schema` 和 `plugin` 数组含 `.opencode/plugins/opencode-lark-bridge`

清理:
```bash
rm -rf "$E2E"
```

- [ ] **Step 4: 端到端手动验证（场景：已有配置 → 追加且保留注释）**

Run:
```bash
E2E=$(mktemp -d)
mkdir -p "$E2E/.opencode"
cat > "$E2E/.opencode/opencode.jsonc" <<'EOF'
{
  // my config
  "theme": "dark"
}
EOF
cd "$E2E"
source /home/lifxu/src/opencode-lark-bridge/scripts/lib/config-register.sh
register_plugin_config
cat "$E2E/.opencode/opencode.jsonc"
```
Expected: 注释 `// my config` 保留，`"theme": "dark"` 保留，新增 `"plugin"` 字段含插件路径

清理:
```bash
rm -rf "$E2E"
```

- [ ] **Step 5: 验证全局配置未被修改**

Run:
```bash
E2E=$(mktemp -d)
export HOME="$E2E/home"
mkdir -p "$HOME/.config/opencode"
printf '{\n  "plugin": ["other"]\n}\n' > "$HOME/.config/opencode/opencode.json"
mkdir -p "$E2E/project/.opencode"
cd "$E2E/project"
source /home/lifxu/src/opencode-lark-bridge/scripts/lib/config-register.sh
register_plugin_config
echo "--- global (should NOT contain lark-bridge) ---"
cat "$HOME/.config/opencode/opencode.json"
echo "--- project (should contain lark-bridge) ---"
cat "$E2E/project/.opencode/opencode.jsonc"
rm -rf "$E2E"
```
Expected: 全局文件保持 `"other"` 不变，项目文件含插件路径

- [ ] **Step 6: 运行实际安装脚本（完整流程）**

Run: `npm run install:local`
Expected: 安装完成，末尾输出注册结果（"Created config..." 或 "already registered..."），不中断

- [ ] **Step 7: 验证 install-global.sh 未受影响（回归）**

Run: `npm run install:global`
Expected: 正常完成（install-global.sh 未修改，不调用 config-register）

- [ ] **Step 8: Commit**

```bash
git add scripts/install-local.sh
git commit -m "feat: integrate config registration into install-local.sh"
```

---

### Task 9: 更新 README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 读取 README 当前安装章节**

Run: `grep -n "install:local\|install-local\|安装" README.md`
定位安装说明段落。

- [ ] **Step 2: 添加自动注册行为说明**

在 `npm run install:local` 说明段落后，追加:

```markdown
### 自动配置注册

运行 `npm run install:local` 后，脚本会自动检查 opencode 主配置文件（`opencode.jsonc` / `opencode.json`）是否已注册本插件路径 `.opencode/plugins/opencode-lark-bridge`：

- **已注册**（项目级或全局任一配置文件包含）：跳过写入，输出提示
- **未注册**：按优先级写入项目级配置文件
  - 优先级：`.opencode/opencode.jsonc` > `./opencode.jsonc` > `.opencode/opencode.json` > `./opencode.json`
  - 若都不存在，创建 `.opencode/opencode.jsonc`（含 `$schema` 与 `plugin` 字段骨架）
- **全局配置只读**：脚本只检查 `~/.config/opencode/` 下的配置，绝不修改
- **保留注释**：写入时用 sed/awk 定点修改，保留原有 JSONC 注释与字段
- **容错**：检查或写入失败仅输出警告，不中断安装

如需手动注册，在 opencode 配置文件的 `plugin` 数组添加：

\`\`\`jsonc
{
  "plugin": [".opencode/plugins/opencode-lark-bridge"]
}
\`\`\`
```

- [ ] **Step 3: 验证 README 渲染**

Run: 检查 README.md 无 Markdown 语法错误（肉眼审查代码块闭合）

- [ ] **Step 4: 运行全量测试回归**

Run: `bash tests/install-local.test.sh`
Expected: PASS=43 FAIL=0（README 改动不影响测试）

- [ ] **Step 5: 勾选 OpenSpec tasks.md 全部条目**

逐项确认 `openspec/changes/install-local-config-registration/tasks.md` 中 1.1–5.1 已实现，勾选 `[x]`。

- [ ] **Step 6: Commit**

```bash
git add README.md openspec/changes/install-local-config-registration/tasks.md
git commit -m "docs: document auto config registration in README + check off tasks"
```

---

## Self-Review 记录

**Spec 覆盖核对（spec.md → Task）:**
- 项目级已注册 → 跳过：Task 3 `test_check_all_project_registered` + Task 7 `test_orchestrate_skips_when_already_registered`
- 全局已注册 → 跳过：Task 3 `test_check_all_global_registered`
- 全部未注册 → 写入：Task 7 `test_orchestrate_creates_when_none_exist`
- 无 plugin 字段 → 视为未注册：Task 2 `test_no_plugin_field_jq`
- 优先 jsonc：Task 4 `test_select_prefers_opencode_jsonc`
- 无 jsonc 写 json：Task 4 `test_select_falls_back_to_json` + Task 7 `test_orchestrate_writes_to_json_when_no_jsonc`
- 都不存在创建 jsonc：Task 4 `test_select_default_when_none_exist` + Task 7
- 新建骨架含 `$schema` + `plugin`：Task 5 `test_write_creates_new_file`
- 保留已有内容/注释：Task 5 `test_write_adds_plugin_field_preserving_comments` + Task 6 `test_write_append_multiline_preserves_comments`
- 追加到已有数组：Task 6 全部场景
- 不修改全局：Task 7 `test_orchestrate_never_modifies_global` + Task 8 Step 5
- 解析失败警告跳过：Task 2 `test_malformed_json_warns_jq`
- 写入失败警告继续：Task 7 `test_orchestrate_write_failure_warns_not_aborts`
- 幂等：Task 7 `test_orchestrate_idempotent`

**无占位符扫描：** 全部 Step 含可执行代码或具体命令，无 TBD/TODO。

**类型/命名一致性：** `PLUGIN_PATH`、`JQ_BIN`、`GLOBAL_CONFIGS`、`PROJECT_CONFIGS`、`strip_jsonc_comments`、`is_plugin_registered`、`check_all_configs`、`select_write_target`、`write_plugin_registration`、`register_plugin_config` 在各 Task 间签名一致。

**与 Design Doc 偏差：**
1. Design §2 注释剥离 — OpenSpec task 1.2 提及 `/* */` 块注释，但 Design 明确"不处理块注释"。本计划遵循 Design Doc（仅 `//`），已在 Global Constraints 注明。
2. 新增 `JQ_BIN` 变量（Design 未提）以支持 grep 回退路径的确定性测试；不改变默认行为。
3. 函数抽取到 `scripts/lib/config-register.sh` 而非内联 install-local.sh（Design 未限定），为可测试性。
