#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
GLOBAL_OPENCODE_DIR="${HOME}/.config/opencode"
PLUGIN_DIR="$GLOBAL_OPENCODE_DIR/plugins/opencode-lark-bridge"
SOURCE_DIR="$PROJECT_ROOT/packages/opencode-lark-bridge"
CONFIG_FILE="opencode-lark-bridge.config.jsonc"
EXAMPLE_FILE="opencode-lark-bridge.config.example.jsonc"
GLOBAL_CONFIG="$GLOBAL_OPENCODE_DIR/$CONFIG_FILE"

cd "$SOURCE_DIR"
npm run build

rm -rf "$PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR"
cp -r dist/* "$PLUGIN_DIR/"
cp package.json bun.lock opencode-lark-bridge.config.example.jsonc "$PLUGIN_DIR/"

(
  cd "$PLUGIN_DIR"
  bun install --production
)

# Seed global config at ~/.config/opencode/ on first install; preserve user edits on subsequent runs.
mkdir -p "$GLOBAL_OPENCODE_DIR"
if [ ! -f "$GLOBAL_CONFIG" ]; then
  cp "$SOURCE_DIR/$EXAMPLE_FILE" "$GLOBAL_CONFIG"
  echo "Created example config at $GLOBAL_CONFIG"
else
  echo "Preserved existing config at $GLOBAL_CONFIG"
fi

echo "Plugin installed to $PLUGIN_DIR"
