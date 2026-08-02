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

# --- 版本写入与 tag ---
run_prepare() {
    local bump_type="$1"

    case "$bump_type" in
        patch|minor|major) ;;
        *)
            error "无效的版本递增类型: $bump_type（应为 patch|minor|major）"
            return 1
            ;;
    esac

    # 幂等重跑验证
    run_verify

    info "执行 npm version $bump_type..."
    local old_version
    old_version=$(node -p "require('./package.json').version")
    npm version "$bump_type"
    local new_version
    new_version=$(node -p "require('./package.json').version")

    PREPARED_TAG="v$new_version"

    info "版本写入完成: $old_version -> $new_version (tag: $PREPARED_TAG)"
}

# --- 发布与推送 ---
run_release() {
    local version
    version=$(node -p "require('./package.json').version")
    local tag="v$version"

    info "发布 $PACKAGE_NAME@$version 到 npm..."
    npm publish
    PUBLISH_DONE=true

    info "推送代码与标签..."
    git push --follow-tags

    info "创建 GitHub Release..."
    if command -v gh &>/dev/null; then
        gh release create "$tag" --title "$tag" --notes "Release $version"
    else
        warn "gh 命令不可用，跳过 GitHub Release 创建"
        warn "手动执行: gh release create $tag --title $tag --notes 'Release $version'"
    fi

    info "发布完成: $PACKAGE_NAME@$version"
    echo "  npm: https://www.npmjs.com/package/$PACKAGE_NAME/v/$version"
    echo "  GitHub: https://github.com/$GITHUB_REPO/releases/tag/$tag"
}

# --- 回滚清理 ---
cleanup_on_failure() {
    local exit_code=$?
    if [ "$PUBLISH_DONE" = "true" ]; then
        local version
        version=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
        error "发布后失败（npm 已发布，不可回滚）"
        warn "npm 包已发布: $PACKAGE_NAME@$version"
        warn "手动处理："
        warn "  - 重试失败步骤（git push 或 gh release）"
        warn "  - 或 72h 内执行: npm unpublish $PACKAGE_NAME@$version"
        exit "$exit_code"
    fi
    if [ -n "$PREPARED_TAG" ]; then
        warn "检测到未发布的版本写入，执行回滚..."
        git checkout -- package.json
        git tag -d "$PREPARED_TAG" 2>/dev/null || true
        warn "已回退版本号并删除本地 tag: $PREPARED_TAG"
    fi
    exit "$exit_code"
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
    prepare)
        shift
        BUMP_TYPE=""
        while [ $# -gt 0 ]; do
            case "$1" in
                --bump)
                    BUMP_TYPE="${2:-}"
                    if [ -z "$BUMP_TYPE" ]; then
                        error "--bump 需要参数: patch|minor|major"
                        exit 1
                    fi
                    shift 2
                    ;;
                *)
                    error "未知参数: $1"
                    show_help
                    exit 1
                    ;;
            esac
        done
        if [ -z "$BUMP_TYPE" ]; then
            error "prepare 需要 --bump <type> 参数"
            show_help
            exit 1
        fi
        case "$BUMP_TYPE" in
            patch|minor|major) ;;
            *)
                error "无效的版本递增类型: $BUMP_TYPE（应为 patch|minor|major）"
                exit 1
                ;;
        esac
        check_auth
        run_prepare "$BUMP_TYPE"
        ;;
    release)
        check_auth
        run_release
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
