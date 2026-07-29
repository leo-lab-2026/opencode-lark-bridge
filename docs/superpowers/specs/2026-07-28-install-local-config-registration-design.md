---
comet_change: install-local-config-registration
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-29-install-local-config-registration
status: final
---

# 技术设计：install-local.sh 智能配置注册

## 概述

本文档是对 OpenSpec `install-local-config-registration` change 的深度技术设计，细化 `scripts/install-local.sh` 的配置检查与写入实现方案。

## 架构

```
install-local.sh 执行流程
│
├── 1. 构建 + 复制产物（现有逻辑）
├── 2. 种子插件配置（现有逻辑）
│
└── 3. [新增] opencode 主配置注册
    ├── 3.1 检查所有配置文件
    │   ├── jq 可用 → 精确检查
    │   └── jq 不可用 → grep 回退检查
    ├── 3.2 判定：任一已注册 → 跳过
    └── 3.3 写入（不依赖 jq）
        ├── 文件不存在 → 创建
        ├── 无 plugin 字段 → sed 插入
        ├── 空数组 [] → sed 替换
        └── 非空数组 → sed 追加
```

## 组件设计

### 1. 配置文件路径定义

```bash
PLUGIN_PATH=".opencode/plugins/opencode-lark-bridge"

# 全局配置（只读检查）
GLOBAL_CONFIGS=(
  "$HOME/.config/opencode/opencode.jsonc"
  "$HOME/.config/opencode/opencode.json"
)

# 项目级配置（检查 + 写入，按优先级排序）
PROJECT_CONFIGS=(
  ".opencode/opencode.jsonc"
  ".opencode/opencode.json"
  "opencode.jsonc"
  "opencode.json"
)
```

### 2. JSONC 注释剥离函数（awk）

用于检查阶段，剥离双引号外的 `//` 注释，使 jq 能解析 JSONC。

```bash
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
```

**设计要点**：
- 逐字符解析，维护 `in_str` 状态
- 遇到双引号外的 `//` 即跳过到行尾
- 不处理块注释 `/* */`（opencode 配置文件极少使用）
- 保留字符串内的 `//`（如 URL `https://`）

### 3. 插件注册检查函数

```bash
is_plugin_registered() {
  local file="$1"
  [ ! -f "$file" ] && return 1

  if command -v jq &> /dev/null; then
    # 精确检查：剥离注释 → jq 解析 → 检查 plugin 数组
    strip_jsonc_comments < "$file" | jq -e --arg p "$PLUGIN_PATH" \
      '.plugin // [] | any(. == $p or endswith($p))' 2>/dev/null
  else
    # 回退检查：grep 字符串匹配
    grep -qF "$PLUGIN_PATH" "$file" 2>/dev/null
  fi
}
```

**降级风险**：grep 可能误判（路径出现在注释中），但后果仅为跳过写入，可接受。

### 4. 全量扫描函数

```bash
check_all_configs() {
  # 检查全局配置
  for cfg in "${GLOBAL_CONFIGS[@]}"; do
    if is_plugin_registered "$cfg"; then
      echo "Plugin already registered in global config: $cfg"
      return 0
    fi
  done

  # 检查项目级配置
  for cfg in "${PROJECT_CONFIGS[@]}"; do
    if is_plugin_registered "$cfg"; then
      echo "Plugin already registered in project config: $cfg"
      return 0
    fi
  done

  return 1  # 未注册
}
```

### 5. 写入目标选择函数

```bash
select_write_target() {
  # 优先级：jsonc > json，项目级 > 根目录
  # 1. 第一个存在的 jsonc 文件
  for cfg in ".opencode/opencode.jsonc" "opencode.jsonc"; do
    [ -f "$cfg" ] && echo "$cfg" && return
  done

  # 2. 第一个存在的 json 文件
  for cfg in ".opencode/opencode.json" "opencode.json"; do
    [ -f "$cfg" ] && echo "$cfg" && return
  done

  # 3. 都不存在，返回默认创建路径
  echo ".opencode/opencode.jsonc"
}
```

### 6. 写入函数（sed 定点修改，保留注释）

```bash
write_plugin_registration() {
  local target="$1"

  if [ ! -f "$target" ]; then
    # 场景 1：创建新文件
    mkdir -p "$(dirname "$target")"
    cat > "$target" <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": [
    "$PLUGIN_PATH"
  ]
}
EOF
    echo "Created config with plugin registration: $target"
    return
  fi

  # 检查是否已有 plugin 字段
  if ! grep -q '"plugin"' "$target"; then
    # 场景 2：无 plugin 字段，在最后一个 } 前插入
    sed -i.bak "/^[[:space:]]*}/i\\
  \"plugin\": [\"$PLUGIN_PATH\"]," "$target"
    rm -f "$target.bak"
    echo "Added plugin field to: $target"
    return
  fi

  # 检查 plugin 数组是否为空 []
  if grep -q '\[[:space:]]*\]' "$target" 2>/dev/null || \
     grep -q '"plugin"[[:space:]]*:[[:space:]]*\[\]' "$target"; then
    # 场景 3：空数组，替换为含元素的数组
    sed -i.bak "s|\"plugin\"[[:space:]]*:[[:space:]]*\[\]|\"plugin\": [\"$PLUGIN_PATH\"]|g" "$target"
    rm -f "$target.bak"
    echo "Added plugin to empty array in: $target"
    return
  fi

  # 场景 4：非空数组，在 ] 前追加
  # 策略：找到 plugin 数组的闭合 ]，在其前一行添加逗号（如需），然后插入新元素
  sed -i.bak "/\"plugin\"/,/]/ {
    /^[[:space:]]*]/i\\
    \"$PLUGIN_PATH\"
  }" "$target"
  # 修正：需要在原最后一个元素后加逗号
  # 更精确的实现见 tasks 阶段
  rm -f "$target.bak"
  echo "Appended plugin to array in: $target"
}
```

**注意**：场景 4 的 sed 实现需要在 tasks 阶段细化，处理：
- 多行数组中最后一个元素的逗号
- 单行数组 `["a"]` → `["a", "new"]`
- 缩进对齐

### 7. 容错与错误处理

```bash
register_plugin_config() {
  if check_all_configs; then
    return 0  # 已注册，跳过
  fi

  local target
  target=$(select_write_target)

  # 写入失败不中断安装
  if ! write_plugin_registration "$target"; then
    echo "WARNING: Failed to write plugin registration to $target"
    echo "         Please manually add '$PLUGIN_PATH' to your opencode config."
    return 1
  fi
}
```

## 数据流

```
install-local.sh
    │
    ├── check_all_configs()
    │     ├── is_plugin_registered() × 6 文件
    │     │     ├── strip_jsonc_comments() [jq 模式]
    │     │     ├── jq -e 检查 [jq 模式]
    │     │     └── grep -qF 检查 [回退模式]
    │     └── 返回：已注册 / 未注册
    │
    ├── select_write_target()
    │     └── 返回：优先级最高的文件路径
    │
    └── write_plugin_registration()
          ├── 文件不存在 → cat 创建
          ├── 无 plugin → sed 插入
          ├── 空数组 → sed 替换
          └── 非空数组 → sed 追加
```

## 测试策略

### 测试场景

| # | 场景 | 输入 | 期望输出 |
|---|------|------|---------|
| 1 | 项目级已注册 | `.opencode/opencode.jsonc` 含插件路径 | 跳过，输出已注册提示 |
| 2 | 全局已注册 | `~/.config/opencode/opencode.jsonc` 含插件路径 | 跳过，输出已注册提示 |
| 3 | 都未注册，有 jsonc | `.opencode/opencode.jsonc` 存在但无插件 | 写入 jsonc，保留注释 |
| 4 | 都未注册，只有 json | 只有 `opencode.json` 存在 | 写入 json |
| 5 | 都不存在 | 无任何配置文件 | 创建 `.opencode/opencode.jsonc` |
| 6 | 格式损坏 | 配置文件 JSON 格式错误 | 输出警告，跳过该文件 |

### 注释保留验证

写入前后对比文件内容，确认：
- `//` 注释保留
- `$schema` URL 保留
- 原有 plugin 数组元素保留

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| jq 不可用 | 中 | 检查降级为 grep | 可接受，后果仅跳过写入 |
| awk 注释剥离边缘情况 | 低 | jq 解析失败 | 输出警告，跳过该文件 |
| sed 数组追加格式错误 | 中 | 配置文件格式损坏 | 创建 `.bak` 备份，测试覆盖 |
| 全局配置被误写 | 低 | 用户配置被修改 | 代码审查确保只写项目级 |
| 配置文件编码非 UTF-8 | 极低 | 解析异常 | 容错跳过 |

## 依赖

- **必须**：bash, sed, grep, awk, mkdir, cat（POSIX 标准）
- **可选**：jq（提升检查精度）
- **开发测试**：mise（管理 jq）
