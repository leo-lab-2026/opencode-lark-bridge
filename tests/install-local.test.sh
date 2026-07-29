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

# ===== Main =====

run_test "strip: pure comment line" test_strip_pure_comment_line
run_test "strip: trailing comment" test_strip_trailing_comment
run_test "strip: preserves URL in string" test_strip_preserves_url_in_string
run_test "strip: preserves // in string" test_strip_preserves_double_slash_in_string
run_test "strip: no comment unchanged" test_strip_preserves_code_without_comment
run_test "is_registered: jq mode registered" test_registered_jq_mode
run_test "is_registered: jq mode not registered" test_not_registered_jq_mode
run_test "is_registered: jq mode jsonc with comments" test_registered_jsonc_with_comments_jq
run_test "is_registered: jq mode no plugin field" test_no_plugin_field_jq
run_test "is_registered: nonexistent file" test_nonexistent_file
run_test "is_registered: grep fallback registered" test_registered_grep_fallback
run_test "is_registered: grep fallback not registered" test_not_registered_grep_fallback
run_test "is_registered: malformed json warns jq" test_malformed_json_warns_jq
run_test "is_registered: jq endswith absolute path" test_registered_absolute_path_jq

echo ""
echo "Results: PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
if [ "$FAIL" -ne 0 ]; then
  echo "Failed tests: ${FAILED_TESTS[*]}"
  exit 1
fi
exit 0
