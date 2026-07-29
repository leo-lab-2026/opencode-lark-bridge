# Comet Spec Context

- Change: install-local-config-registration
- Phase: design
- Mode: beta
- Context hash: ecabc04a75a25e866a37d9ef4f7e83798993a4ef139b22b83b614d1c20fcc389

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This beta context pack verbatim-projects spec files and references supporting artifacts by hash, not an agent-authored summary.

## Source References

- Source: openspec/changes/install-local-config-registration/proposal.md
- SHA256: f17e77a0a0e26cb4f826d5841907b58a938548b87301e4f47b23bb40877b2ccc
- Source: openspec/changes/install-local-config-registration/design.md
- SHA256: 84acc655dc295a570fbeda4b6544365df4a6cafb555f271509961d494bdf5d74
- Source: openspec/changes/install-local-config-registration/tasks.md
- SHA256: e2edcdb6406f3c8db2ae5a6a6baed8230849ef44e72f135b918a0ea71dcc2637
- Source: openspec/changes/install-local-config-registration/specs/install-config-registration/spec.md
- SHA256: 23a204ccf1d4ad16b043c40640653f226855ebd22771ef0b42a4180301319fe7

## Acceptance Projection

## openspec/changes/install-local-config-registration/specs/install-config-registration/spec.md

- Source: openspec/changes/install-local-config-registration/specs/install-config-registration/spec.md
- Lines: 1-77
- SHA256: 23a204ccf1d4ad16b043c40640653f226855ebd22771ef0b42a4180301319fe7

```md
## ADDED Requirements

### Requirement: 安装脚本检查插件注册状态

安装脚本 SHALL 在执行安装流程时，检查所有 opencode 配置文件是否已注册本插件路径。

#### Scenario: 项目级配置已注册插件
- **WHEN** 任一项目级配置文件（`.opencode/opencode.jsonc`、`.opencode/opencode.json`、`./opencode.jsonc`、`./opencode.json`）的 `plugin` 数组包含 `.opencode/plugins/opencode-lark-bridge`
- **THEN** 跳过配置写入步骤，输出已注册提示

#### Scenario: 全局配置已注册插件
- **WHEN** 任一全局配置文件（`~/.config/opencode/opencode.jsonc`、`~/.config/opencode/opencode.json`）的 `plugin` 数组包含 `.opencode/plugins/opencode-lark-bridge` 或绝对路径形式的本插件
- **THEN** 跳过配置写入步骤，输出已注册提示

#### Scenario: 所有配置文件都未注册插件
- **WHEN** 所有配置文件都不存在，或存在但 `plugin` 数组不包含本插件路径
- **THEN** 进入写入流程，按优先级写入项目级配置文件

#### Scenario: 配置文件存在但无 plugin 字段
- **WHEN** 配置文件存在但不含 `plugin` 字段
- **THEN** 视为未注册，进入写入流程

### Requirement: 按优先级写入项目级配置文件

安装脚本 SHALL 在所有配置文件都未注册插件时，按优先级选择项目级配置文件写入插件注册信息。

#### Scenario: 优先写入已存在的 jsonc 文件
- **WHEN** 项目级配置文件中存在 jsonc 文件（`.opencode/opencode.jsonc` 或 `./opencode.jsonc`）
- **THEN** 按优先级 `.opencode/opencode.jsonc` > `./opencode.jsonc` 选择第一个存在的 jsonc 文件写入

#### Scenario: 无 jsonc 文件时写入已存在的 json 文件
- **WHEN** 项目级配置文件中不存在 jsonc 文件，但存在 json 文件（`.opencode/opencode.json` 或 `./opencode.json`）
- **THEN** 按优先级 `.opencode/opencode.json` > `./opencode.json` 选择第一个存在的 json 文件写入

#### Scenario: 项目级配置文件都不存在时创建 jsonc
- **WHEN** 所有项目级配置文件都不存在
- **THEN** 创建 `.opencode/opencode.jsonc`，写入包含 `$schema` 和 `plugin` 字段的完整配置

### Requirement: 新建配置文件骨架结构

安装脚本 SHALL 在创建新的配置文件时，包含 `$schema` 和 `plugin` 字段。

#### Scenario: 创建新配置文件的内容
- **WHEN** 安装脚本创建新的 `.opencode/opencode.jsonc` 文件
- **THEN** 文件内容包含 `"$schema": "https://opencode.ai/config.json"` 和 `"plugin": [".opencode/plugins/opencode-lark-bridge"]`

### Requirement: 保留已有配置内容

安装脚本 SHALL 在向已存在的配置文件写入插件注册时，保留原有配置内容和注释。

#### Scenario: 向已有配置文件添加 plugin 字段
- **WHEN** 配置文件存在但无 `plugin` 字段
- **THEN** 添加 `plugin` 字段，保留原有字段和注释

#### Scenario: 向已有 plugin 数组追加插件
- **WHEN** 配置文件存在且有 `plugin` 数组，但数组不包含本插件
- **THEN** 向 `plugin` 数组追加本插件路径，保留原有数组元素和其他配置

### Requirement: 不修改全局配置文件

安装脚本 SHALL NOT 修改全局配置文件（`~/.config/opencode/` 目录下的任何文件）。

#### Scenario: 全局配置文件只读
- **WHEN** 所有配置文件都未注册插件
- **THEN** 写入操作只作用于项目级配置文件，全局配置文件保持不变

### Requirement: 安装失败容错

安装脚本 SHALL 在配置检查或写入失败时输出警告并继续安装流程，不中断主安装步骤。

#### Scenario: 配置文件解析失败
- **WHEN** 配置文件存在但格式损坏，无法解析
- **THEN** 输出警告信息，跳过该文件的处理，继续检查其他文件

#### Scenario: 写入权限不足
- **WHEN** 项目级配置文件目录无写入权限
- **THEN** 输出警告信息，跳过写入步骤，继续完成安装流程

```

Full source files remain canonical. If a required heading or scenario is missing here, regenerate the handoff or read the source spec directly. Supporting files (proposal, design, tasks) are referenced by hash only.