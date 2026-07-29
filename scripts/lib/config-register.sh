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

check_all_configs() {
  local cfg
  local global_configs=(
    "$HOME/.config/opencode/opencode.jsonc"
    "$HOME/.config/opencode/opencode.json"
  )
  for cfg in "${global_configs[@]}"; do
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
