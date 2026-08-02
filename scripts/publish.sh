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
