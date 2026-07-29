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

# ===== check_all_configs tests =====

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
  printf '{\n  "plugin": ["other"]\n}\n' > "$HOME/.config/opencode/opencode.json"
  assert_exit 1 check_all_configs
  assert_file_not_contains "$HOME/.config/opencode/opencode.json" "$PLUGIN_PATH"
}

# ===== select_write_target tests =====

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
  touch ".opencode/opencode.json"
  assert_eq ".opencode/opencode.json" "$(select_write_target)"
}

test_select_default_when_none_exist() {
  sandbox_setup
  assert_eq ".opencode/opencode.jsonc" "$(select_write_target)"
}

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

# ===== write_plugin_registration scenario 3 & 4 tests =====

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

# ===== Main =====

run_test "write: creates new file with schema+plugin" test_write_creates_new_file
run_test "write: creates parent dir" test_write_creates_parent_dir
run_test "write: adds plugin field preserving comments" test_write_adds_plugin_field_preserving_comments
run_test "write: adds plugin field to nested config" test_write_adds_plugin_field_to_nested_config
run_test "write: skips non-json file" test_write_skips_non_json_file
run_test "write: empty array single line" test_write_empty_array_single_line
run_test "write: empty array with spaces" test_write_empty_array_with_spaces
run_test "write: append single-line array" test_write_append_single_line_array
run_test "write: append single-line multi-element" test_write_append_single_line_multi_element
run_test "write: append multiline array" test_write_append_multiline_array
run_test "write: append multiline preserves comments" test_write_append_multiline_preserves_comments
run_test "write: append trailing-comma style" test_write_append_trailing_comma_style

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
run_test "check_all: project registered" test_check_all_project_registered
run_test "check_all: global registered" test_check_all_global_registered
run_test "check_all: none registered" test_check_all_none_registered
run_test "check_all: no files exist" test_check_all_no_files
run_test "check_all: global never written" test_check_all_global_never_written
run_test "select: prefers .opencode/opencode.jsonc" test_select_prefers_opencode_jsonc
run_test "select: root jsonc over opencode json" test_select_prefers_root_jsonc_over_opencode_json
run_test "select: falls back to json" test_select_falls_back_to_json
run_test "select: json priority opencode over root" test_select_json_priority_opencode_over_root
run_test "select: default when none exist" test_select_default_when_none_exist

# ===== register_plugin_config orchestration tests =====

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
  mkdir -p ".opencode"
  chmod 555 ".opencode"
  local err
  err=$(register_plugin_config 2>&1) || true
  chmod 755 ".opencode"
  assert_contains "$err" "WARNING"
}

run_test "orchestrate: skips when already registered" test_orchestrate_skips_when_already_registered
run_test "orchestrate: creates when none exist" test_orchestrate_creates_when_none_exist
run_test "orchestrate: writes to existing jsonc" test_orchestrate_writes_to_existing_jsonc
run_test "orchestrate: writes to json when no jsonc" test_orchestrate_writes_to_json_when_no_jsonc
run_test "orchestrate: never modifies global" test_orchestrate_never_modifies_global
run_test "orchestrate: idempotent" test_orchestrate_idempotent
run_test "orchestrate: write failure warns not aborts" test_orchestrate_write_failure_warns_not_aborts

echo ""
echo "Results: PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
if [ "$FAIL" -ne 0 ]; then
  echo "Failed tests: ${FAILED_TESTS[*]}"
  exit 1
fi
exit 0
