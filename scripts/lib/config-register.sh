#!/usr/bin/env bash
# Config registration helpers for install-local.sh.
# Source-only: defines functions and constants, no side effects on source.

# OpenCode V1 插件配置说明：
# - OpenCode V1 的自动发现机制不稳定，需要显式配置插件路径
# - 配置字段名为 `plugin`（单数），路径相对于 .opencode/ 目录
# - 推荐路径：./plugins/opencode-lark-bridge
#
# 参考：https://opencode.ai/v2/docs/build/plugins
# 参考：https://github.com/anomalyco/opencode/issues/28384

# Plugin path relative to .opencode/ directory
PLUGIN_PATH="${PLUGIN_PATH:-./plugins/opencode-lark-bridge}"

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

write_plugin_registration() {
  local target="$1"

  if [ ! -f "$target" ]; then
    mkdir -p "$(dirname "$target")"
    if ! cat > "$target" <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": [
    "$PLUGIN_PATH"
  ]
}
EOF
    then
      echo "WARNING: Failed to create $target" >&2
      return 1
    fi
    echo "Created config with plugin registration: $target"
    return 0
  fi

  if ! grep -q '{' "$target" || ! grep -q '}' "$target"; then
    echo "WARNING: $target does not look like a valid JSON config, skipping write" >&2
    return 1
  fi

  if ! grep -q '"plugin"' "$target"; then
    local last_brace
    last_brace=$(grep -n '}' "$target" | tail -1 | cut -d: -f1)
    if [ -z "$last_brace" ]; then
      echo "WARNING: Could not find insertion point in $target" >&2
      return 1
    fi
    sed -i.bak "${last_brace}i\\
  \"plugin\": [\"$PLUGIN_PATH\"]," "$target" && rm -f "$target.bak"
    echo "Added plugin field to: $target"
    return 0
  fi

  # Scenario 3: empty array [] (single-line, possibly with spaces)
  if grep -qE '"plugin"[[:space:]]*:[[:space:]]*\[[[:space:]]*\]' "$target"; then
    sed -i.bak -E "s|(\"plugin\"[[:space:]]*:[[:space:]]*\[)[[:space:]]*\]|\\1\"$PLUGIN_PATH\"]|g" "$target" && rm -f "$target.bak"
    echo "Added plugin to empty array in: $target"
    return 0
  fi

  # Scenario 4: non-empty array -> append
  # Sub-case 4a: single-line array "plugin": ["a", ...]
  if grep -qE '"plugin"[[:space:]]*:[[:space:]]*\[.*\]' "$target"; then
    sed -i.bak -E "s|(\"plugin\"[[:space:]]*:[[:space:]]*\[[[:space:]]*[^]]*[^[:space:]])([[:space:]]*\])|\\1, \"$PLUGIN_PATH\"\\2|" "$target" && rm -f "$target.bak"
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
    sed -i.bak -E "${last_elem_line}s|[[:space:]]*$|,|" "$target" && rm -f "$target.bak"
  fi

  # Indentation matching the last element
  local indent
  indent=$(sed -n "${last_elem_line}p" "$target" | awk '{ match($0, /^[[:space:]]*/); print substr($0, 1, RLENGTH) }')

  # Insert new element before closing ]
  sed -i.bak "${close_line}i\\
${indent}\"$PLUGIN_PATH\"" "$target" && rm -f "$target.bak"
  echo "Appended plugin to multi-line array in: $target"
  return 0
}

# Orchestrate: 自动注册插件到 opencode.jsonc。
# OpenCode V1 的自动发现机制不稳定，显式配置是必要的。
# 路径应为 ./plugins/opencode-lark-bridge（相对于 .opencode/ 目录）。
register_plugin_config() {
  if check_all_configs; then
    echo "✓ Plugin already registered"
    return 0
  fi

  local target
  target=$(select_write_target)
  
  echo "Registering plugin in: $target"
  if write_plugin_registration "$target"; then
    echo "✓ Plugin registered successfully"
    return 0
  else
    echo "✗ Failed to register plugin"
    return 1
  fi
}
