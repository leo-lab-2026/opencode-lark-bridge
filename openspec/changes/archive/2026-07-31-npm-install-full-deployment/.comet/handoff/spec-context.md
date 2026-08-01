# Comet Spec Context

- Change: npm-install-full-deployment
- Phase: design
- Mode: beta
- Context hash: 1e3f83b457b77ae72ac917edfd1907b5aeb726d14bdbf2c4f390e7b0b391438d

Generated-by: comet-handoff.sh

OpenSpec remains the canonical capability spec. This beta context pack verbatim-projects spec files and references supporting artifacts by hash, not an agent-authored summary.

## Source References

- Source: openspec/changes/npm-install-full-deployment/proposal.md
- SHA256: fa3239bcd90d0698ce67c3f272cb8dfe172dd20106440ad5e52b31cec955c299
- Source: openspec/changes/npm-install-full-deployment/design.md
- SHA256: 25db0ce43758fd3896165718348ab2ba0e3cde06ea460c1b13d5fe65f4a2867f
- Source: openspec/changes/npm-install-full-deployment/tasks.md
- SHA256: abd0b3ec0ef3bc67c073b387dd0a74f69c44a8e933cfc7a22ca5761caa242582
- Source: openspec/changes/npm-install-full-deployment/specs/install-config-registration/spec.md
- SHA256: 0fcbd0c1acd6660febcc7524060617b36a6720844810cd806700f993cb38ee0a
- Source: openspec/changes/npm-install-full-deployment/specs/npm-package-install/spec.md
- SHA256: 989f8995b7586fb963da5c8ac6933809e77a94f2a92b152bf1920e879e1214ef
- Source: openspec/changes/npm-install-full-deployment/specs/npm-publish-preparation/spec.md
- SHA256: a7a491f6412741b1edf1b5c087a287ea18debe1a888da80384886d5d4f06a6ef

## Acceptance Projection

## openspec/changes/npm-install-full-deployment/specs/install-config-registration/spec.md

- Source: openspec/changes/npm-install-full-deployment/specs/install-config-registration/spec.md
- Lines: 1-17
- SHA256: 0fcbd0c1acd6660febcc7524060617b36a6720844810cd806700f993cb38ee0a

```md
## MODIFIED Requirements

### Requirement: 不修改全局配置文件

安装脚本 SHALL 根据安装模式决定是否修改全局配置文件。项目级安装模式 SHALL NOT 修改全局配置文件；全局安装模式 SHALL 向全局配置文件写入插件注册信息。

#### Scenario: 项目级安装时全局配置文件只读
- **WHEN** 安装模式为项目级（`npm_config_global` 不为 `true`）且所有配置文件都未注册插件
- **THEN** 写入操作只作用于项目级配置文件，全局配置文件保持不变

#### Scenario: 全局安装时写入全局配置文件
- **WHEN** 安装模式为全局（`npm_config_global` 为 `true`）且全局配置文件未注册插件
- **THEN** 按优先级 `~/.config/opencode/opencode.jsonc` > `~/.config/opencode/opencode.json` 选择全局配置文件写入插件注册信息，插件路径使用绝对路径形式

#### Scenario: 全局安装时已注册则跳过
- **WHEN** 安装模式为全局且全局配置文件已注册本插件路径
- **THEN** 跳过全局配置写入步骤，输出已注册提示

```

## openspec/changes/npm-install-full-deployment/specs/npm-package-install/spec.md

- Source: openspec/changes/npm-install-full-deployment/specs/npm-package-install/spec.md
- Lines: 1-101
- SHA256: 989f8995b7586fb963da5c8ac6933809e77a94f2a92b152bf1920e879e1214ef

```md
## Purpose

定义 npm 包通过 postinstall 自动完成插件完整部署的行为契约，包括项目级和全局两种安装模式，以及 CLI install 子命令作为手动备选入口。

## ADDED Requirements

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

```

## openspec/changes/npm-install-full-deployment/specs/npm-publish-preparation/spec.md

- Source: openspec/changes/npm-install-full-deployment/specs/npm-publish-preparation/spec.md
- Lines: 1-61
- SHA256: a7a491f6412741b1edf1b5c087a287ea18debe1a888da80384886d5d4f06a6ef

```md
## Purpose

定义 npm 包发布前的项目整改合规性要求和发布流程，确保 package.json 字段完整、files 声明正确、发布前测试通过，并提供发布流程文档。

## ADDED Requirements

### Requirement: package.json 发布合规字段

package.json SHALL 包含 npm 发布所需的全部合规字段：`name`、`version`、`description`、`main`、`bin`、`files`、`type`、`license`、`repository`、`homepage`、`bugs`、`keywords`、`author`。

#### Scenario: package.json 字段完整
- **WHEN** 检查 package.json 的发布合规字段
- **THEN** 所有必填字段（name、version、description、main、bin、files、type、license）存在且非空，推荐字段（repository、homepage、bugs、keywords、author）存在

#### Scenario: repository 指向 GitHub 仓库
- **WHEN** 检查 package.json 的 repository 字段
- **THEN** 字段值为对象，包含 `type: "git"` 和指向 GitHub 仓库的 `url`（格式为 `https://github.com/<owner>/<repo>.git`）

#### Scenario: license 字段声明
- **WHEN** 检查 package.json 的 license 字段
- **THEN** 字段值为有效的 SPDX 许可证标识符（如 `MIT`、`Apache-2.0`）

### Requirement: files 声明包含运行时必需文件

package.json 的 `files` 字段 SHALL 声明发布包运行时所需的全部文件和目录，不包含开发专用文件。

#### Scenario: files 包含运行时文件
- **WHEN** 检查 package.json 的 files 字段
- **THEN** 数组包含 `dist`（编译产物）、`opencode-lark-bridge.config.example.jsonc`（示例配置）、`README.md`、`package.json`、`bun.lock`

#### Scenario: files 不包含开发专用文件
- **WHEN** 检查 package.json 的 files 字段
- **THEN** 数组不包含 `src`、`tests`、`scripts`、`openspec`、`docs`、`.opencode` 等开发专用路径

### Requirement: 发布前测试验证

发布前 SHALL 执行测试验证，确保发布包内容正确且可安装。

#### Scenario: prepublishOnly 自动测试
- **WHEN** 执行 `npm publish`
- **THEN** `prepublishOnly` 钩子自动执行 `npm run build` 和 `bun test`，任一失败则中止发布

#### Scenario: npm pack dry-run 验证包内容
- **WHEN** 执行 `npm pack --dry-run` 或 `npm run pack:dry`
- **THEN** 输出的包内容列表只包含 files 字段声明的文件，不包含意外的开发文件

#### Scenario: 发布包本地安装验证
- **WHEN** 在临时目录执行 `npm install <tarball>` 安装生成的 tarball
- **THEN** postinstall 正确执行，插件文件被复制到目标 .opencode/plugins/ 目录

### Requirement: 发布流程文档

项目 SHALL 包含明确的 npm 发布流程文档，覆盖发布前检查、发布步骤、版本管理和回滚策略。

#### Scenario: 文档存在且内容完整
- **WHEN** 检查 `docs/PUBLISH.md`
- **THEN** 文档包含以下章节：发布前检查清单、发布步骤、版本管理策略、回滚策略、GitHub Release 关联

#### Scenario: README 链接发布文档
- **WHEN** 检查 README.md
- **THEN** 包含指向 `docs/PUBLISH.md` 的链接或在安装说明中引用发布流程

```

Full source files remain canonical. If a required heading or scenario is missing here, regenerate the handoff or read the source spec directly. Supporting files (proposal, design, tasks) are referenced by hash only.