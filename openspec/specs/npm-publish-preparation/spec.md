# npm-publish-preparation Specification

## Purpose
定义 npm 包发布前的项目整改合规性要求和发布流程，确保 package.json 字段完整、files 声明正确、发布前测试通过，并提供发布流程文档。
## Requirements
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

