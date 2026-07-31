## MODIFIED Requirements

### Requirement: 不修改全局配置文件

安装脚本 SHALL 根据安装模式决定是否修改全局配置文件。项目级安装模式 SHALL NOT 修改全局配置文件；全局安装模式 SHALL 向全局配置文件写入插件注册信息。

#### Scenario: 全局配置文件只读

- **WHEN** 安装模式为项目级（`npm_config_global` 不为 `true`）且所有配置文件都未注册插件
- **THEN** 写入操作只作用于项目级配置文件，全局配置文件保持不变

#### Scenario: 全局安装时写入全局配置文件

- **WHEN** 安装模式为全局（`npm_config_global` 为 `true`）且全局配置文件未注册插件
- **THEN** 按优先级 `~/.config/opencode/opencode.jsonc` > `~/.config/opencode/opencode.json` 选择全局配置文件写入插件注册信息，插件路径使用绝对路径形式

#### Scenario: 全局安装时已注册则跳过

- **WHEN** 安装模式为全局且全局配置文件已注册本插件路径
- **THEN** 跳过全局配置写入步骤，输出已注册提示
