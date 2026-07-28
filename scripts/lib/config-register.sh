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
