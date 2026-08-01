# npm-package-install Specification

## Purpose
定义 npm 包通过 postinstall 自动完成插件完整部署的行为契约，包括项目级和全局两种安装模式，以及 CLI install 子命令作为手动备选入口。
## Requirements
### Requirement: npm install 触发完整安装

`postinstall` 钩子 SHALL 在 `npm install opencode-lark-bridge` 完成后自动执行完整插件部署，包括：将 dist 文件复制到目标 plugins 目录、安装生产依赖、生成示例配置（如不存在）、向 opencode.jsonc 注册插件路径。

#### Scenario: 项目级 npm install 完成完整部署
- **WHEN** 用户在目标项目目录执行 `npm install opencode-lark-bridge`（非 -g）
- **THEN** postinstall 自动将 dist 文件复制到 `<cwd>/.opencode/plugins/opencode-lark-bridge/`，安装生产依赖，在 `<cwd>/.opencode/` 生成示例配置（如不存在），向项目级 opencode.jsonc 注册插件

#### Scenario: 全局 npm install 完成完整部署
- **WHEN** 用户执行 `npm install -g opencode-lark-bridge`
- **THEN** postinstall 自动将 dist 文件复制到 `~/.config/opencode/plugins/opencode-lark-bridge/`，安装生产依赖，在 `~/.config/opencode/` 生成示例配置（如不存在），向全局 opencode.jsonc 注册插件

#### Scenario: postinstall 依赖文件缺失时降级
- **WHEN** postinstall 执行时 dist 目录或 example config 文件不存在
- **THEN** 输出警告信息并跳过安装步骤，不抛出致命错误，不阻塞 npm 主流程

### Requirement: 安装模式自动检测

postinstall SHALL 通过 `npm_config_global` 环境变量自动检测安装模式，无需用户传入额外参数。

#### Scenario: 项目级模式检测
- **WHEN** `npm_config_global` 环境变量不为 `"true"` 或不存在
- **THEN** 安装目标为 `<INIT_CWD>/.opencode/plugins/opencode-lark-bridge/`，配置注册写入项目级 opencode.jsonc

#### Scenario: 全局模式检测
- **WHEN** `npm_config_global` 环境变量为 `"true"`
- **THEN** 安装目标为 `~/.config/opencode/plugins/opencode-lark-bridge/`，配置注册写入全局 opencode.jsonc

#### Scenario: INIT_CWD 缺失时回退
- **WHEN** 项目级模式下 `INIT_CWD` 环境变量不存在
- **THEN** 回退使用 `process.cwd()` 作为目标项目根目录

### Requirement: 文件复制覆盖

安装 SHALL 将发布包内的 dist 文件、package.json、bun.lock 和 example config 复制到目标 plugins 目录，已存在的同名文件被覆盖。

#### Scenario: 首次安装复制全部文件
- **WHEN** 目标 plugins 目录不存在插件
- **THEN** 创建目录并复制 dist/*、package.json、bun.lock、opencode-lark-bridge.config.example.jsonc

#### Scenario: 重复安装覆盖旧文件
- **WHEN** 目标 plugins 目录已存在插件
- **THEN** 先清除旧目录，再重新复制全部文件，确保文件为最新版本

### Requirement: 生产依赖安装

安装 SHALL 在目标 plugins 目录内执行生产依赖安装（`bun install --production` 或等效命令），使插件可直接运行。

#### Scenario: 项目级安装依赖
- **WHEN** 文件复制完成且目标为项目级 plugins 目录
- **THEN** 在该目录内执行生产依赖安装，生成 node_modules

#### Scenario: 依赖安装工具不可用时降级
- **WHEN** bun 和 npm 均不可用
- **THEN** 输出警告信息，跳过依赖安装步骤，不阻塞安装流程

### Requirement: CLI install 子命令

CLI SHALL 提供 `install` 子命令，允许用户手动触发与 postinstall 相同的完整安装逻辑，作为 postinstall 失败时的备选入口。

#### Scenario: 手动项目级安装
- **WHEN** 用户执行 `npx opencode-lark-bridge install`
- **THEN** 执行与项目级 postinstall 相同的完整安装逻辑

#### Scenario: 手动全局安装
- **WHEN** 用户执行 `npx opencode-lark-bridge install --global` 或 `-g`
- **THEN** 执行与全局 postinstall 相同的完整安装逻辑

#### Scenario: install 子命令复用安装逻辑
- **WHEN** CLI install 子命令被调用
- **THEN** 复用 postinstall 的安装函数，确保行为一致性

### Requirement: 安装幂等性

重复执行安装 SHALL 安全完成，不产生损坏状态。

#### Scenario: 重复执行安装
- **WHEN** 用户多次执行 npm install 或 CLI install
- **THEN** 每次安装覆盖插件文件但保留用户已修改的配置文件（opencode-lark-bridge.config.jsonc 和 opencode.jsonc）

#### Scenario: 已注册插件不重复注册
- **WHEN** opencode.jsonc 的 plugin 数组已包含本插件路径
- **THEN** 跳过注册写入步骤，输出已注册提示

### Requirement: 安装失败容错

安装过程中任一步骤失败 SHALL 输出警告但不阻塞 npm 主流程。

#### Scenario: 文件复制失败
- **WHEN** 文件复制因权限不足或磁盘空间不足失败
- **THEN** 输出警告信息，不抛出退出码非零的错误

#### Scenario: 依赖安装失败
- **WHEN** 生产依赖安装失败
- **THEN** 输出警告信息，跳过依赖步骤，继续执行配置种子和注册步骤

