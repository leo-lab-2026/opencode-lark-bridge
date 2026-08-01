#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMPDIR_BASE="$(mktemp -d)"
trap 'cleanup' EXIT

cleanup() {
  rm -rf "$TMPDIR_BASE"
  # 清理可能的全局安装
  npm uninstall -g opencode-lark-bridge 2>/dev/null || true
}

cd "$PROJECT_ROOT"

echo "=== 1. Build ==="
npm run build

echo "=== 2. Test ==="
bun test

echo "=== 3. Pack ==="
TARBALL=$(npm pack | tail -1)
TARBALL_PATH="$PROJECT_ROOT/$TARBALL"
echo "Tarball: $TARBALL_PATH"

echo "=== 4. Project-level install test ==="
PROJ_TEST="$TMPDIR_BASE/project-test"
mkdir -p "$PROJ_TEST"
cd "$PROJ_TEST"
npm init -y >/dev/null
npm install "$TARBALL_PATH"

# 手动运行 postinstall（npm 安全机制可能阻止自动执行）
# 设置 INIT_CWD 确保正确的安装路径
if [ -f "node_modules/opencode-lark-bridge/dist/postinstall.js" ]; then
  echo "--- Running postinstall manually ---"
  INIT_CWD="$(pwd)" node node_modules/opencode-lark-bridge/dist/postinstall.js
fi

echo "--- Verifying project-level install ---"
test -d ".opencode/plugins/opencode-lark-bridge/dist/" || { echo "FAIL: plugin dist/ not found"; exit 1; }
test -f ".opencode/plugins/opencode-lark-bridge/package.json" || { echo "FAIL: plugin package.json not found"; exit 1; }
test -f ".opencode/opencode-lark-bridge.config.jsonc" || { echo "FAIL: config seed not found"; exit 1; }
test -f ".opencode/opencode.jsonc" || { echo "FAIL: opencode.jsonc not created"; exit 1; }
grep -q "opencode-lark-bridge" ".opencode/opencode.jsonc" || { echo "FAIL: plugin not registered"; exit 1; }
# 项目级安装不得把 opencode.jsonc 写入 node_modules 包内
if [ -d "node_modules/opencode-lark-bridge/.opencode" ]; then
  echo "FAIL: opencode.jsonc leaked into node_modules/opencode-lark-bridge/.opencode"; exit 1
fi
echo "PASS: project-level install"

echo "=== 5. Global install test ==="
npm install -g "$TARBALL_PATH"

# 手动运行 postinstall（npm 安全机制可能阻止自动执行）
GLOBAL_PLUGIN_DIR="$HOME/.config/opencode/plugins/opencode-lark-bridge"
if [ -f "$GLOBAL_PLUGIN_DIR/dist/postinstall.js" ]; then
  echo "--- Running global postinstall manually ---"
  # 模拟 npm install -g 环境：npm_config_global=true + INIT_CWD=用户项目目录
  npm_config_global=true INIT_CWD="$(pwd)" node "$GLOBAL_PLUGIN_DIR/dist/postinstall.js"
fi

echo "--- Verifying global install ---"
GLOBAL_PLUGIN_DIR="$HOME/.config/opencode/plugins/opencode-lark-bridge"
test -d "$GLOBAL_PLUGIN_DIR/dist/" || { echo "FAIL: global plugin dist/ not found"; exit 1; }
test -f "$HOME/.config/opencode/opencode.jsonc" || { echo "FAIL: global opencode.jsonc not found"; exit 1; }
grep -q "opencode-lark-bridge" "$HOME/.config/opencode/opencode.jsonc" || { echo "FAIL: global plugin not registered"; exit 1; }
echo "PASS: global install"

echo "=== 6. CLI install command test ==="
cd "$TMPDIR_BASE"
mkdir -p cli-test && cd cli-test
npx opencode-lark-bridge install
test -d ".opencode/plugins/opencode-lark-bridge/dist/" || { echo "FAIL: CLI install did not create plugin dir"; exit 1; }
echo "PASS: CLI install command"

echo ""
echo "✓ All install tests passed"
