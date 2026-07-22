#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PLUGIN_DIR="$PROJECT_ROOT/.opencode/plugins/opencode-lark-bridge"
SOURCE_DIR="$PROJECT_ROOT/packages/opencode-lark-bridge"
CONFIG_FILE="opencode-lark-bridge.config.jsonc"
EXAMPLE_FILE="opencode-lark-bridge.config.example.jsonc"
PROJECT_CONFIG="$PROJECT_ROOT/.opencode/$CONFIG_FILE"

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

# Seed project-level config at .opencode root on first install; preserve user edits on subsequent runs.
mkdir -p "$PROJECT_ROOT/.opencode"
if [ ! -f "$PROJECT_CONFIG" ]; then
  cp "$SOURCE_DIR/$EXAMPLE_FILE" "$PROJECT_CONFIG"
  echo "Created example config at $PROJECT_CONFIG"
else
  echo "Preserved existing config at $PROJECT_CONFIG"
fi

echo "Plugin installed to $PLUGIN_DIR"
