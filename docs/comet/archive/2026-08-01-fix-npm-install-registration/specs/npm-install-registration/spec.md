# npm-install-registration 完整目标规格

## 概述

本插件通过 npm 安装（postinstall 自动部署）与 CLI 命令卸载时，opencode 配置文件的插件注册行为。核心原则：配置文件存在时只做本插件条目的文本级插入/修改/删除，绝不整体覆盖或重排其他内容；项目级写入项目配置，全局写入全局配置。

## 配置查找

### 项目级配置查找优先级

按顺序查找以下候选，取第一个存在者：

1. `<projectRoot>/.opencode/opencode.jsonc`
2. `<projectRoot>/.opencode/opencode.json`
3. `<projectRoot>/opencode.jsonc`
4. `<projectRoot>/opencode.json`

`<projectRoot>` 指用户执行 npm install 的目录（npm 环境变量 `INIT_CWD`；无 npm 环境时回退 `process.cwd()`）。不得使用 postinstall 运行时的包目录（`node_modules/...`）。

### 全局配置查找优先级

1. `~/.config/opencode/opencode.jsonc`
2. `~/.config/opencode/opencode.json`

## 注册（安装）

### 项目级注册

1. 按项目级优先级查找已存在的配置文件
2. 若存在一个或多个：
   - 若任一已存在文件已正确注册本插件（plugin 数组含等于或 endsWith 本插件路径的条目），不修改任何文件
   - 否则，按优先级顺序取第一个存在的文件，在文本层面修改其 plugin 内容，添加本插件条目（若文件无 plugin 字段则在合适位置插入 `"plugin": [...]`；若 plugin 为空数组则填入；若非空则追加）
3. 若都不存在：创建 `<projectRoot>/.opencode/opencode.jsonc`，写入 `$schema` 与 `plugin: [<本插件路径>]`

项目级本插件路径：`./plugins/opencode-lark-bridge`（相对 `.opencode/` 目录）。

### 全局注册

1. 按全局优先级查找已存在的配置文件
2. 若存在：检查 plugin 内容中本插件是否已正确配置（等于或 endsWith 本插件绝对路径），已正确则不动；否则文本级插入/修改为本插件条目
3. 若都不存在：创建 `~/.config/opencode/opencode.jsonc`，写入 `$schema` 与 `plugin: [<本插件绝对路径>]`

全局本插件路径：`~/.config/opencode/plugins/opencode-lark-bridge`（绝对路径）。

## 注销（卸载）

### 项目级注销

按项目级优先级查找所有已存在的配置文件（jsonc 与 json 均检查），对每个存在本插件条目的文件，文本级删除该条目；其他内容与格式保持不变。若 plugin 数组删除后为空，保留 `"plugin": []`。

### 全局注销

查找所有全局配置文件（opencode.jsonc 与 opencode.json），对每个存在本插件条目的文件，文本级删除该条目；其他内容不变。若 plugin 数组删除后为空，保留 `"plugin": []`。

## 文本级修改规则（移植自 scripts/lib/config-register.sh）

对已存在文件只做最小文本修改：

- 无 plugin 字段：在最后一个顶层 `}` 前插入 `"plugin": [...]`
- plugin 为空数组：把 `[]` 替换为 `[<本插件路径>]`
- plugin 非空单行数组：在 `]` 前追加 `, <本插件路径>`
- plugin 非空多行数组：给最后元素补尾逗号（如缺），在 `]` 前插入缩进一致的新元素行
- 已注册（等于或 endsWith 匹配）：不修改
- 文件无法解析为 JSON/JSONC 或缺少 `{`/`}`：警告并跳过，不写文件

删除规则：

- 单行数组仅含本插件：`[...]` → `[]`（若数组中还有其他元素，只删除本插件元素）
- 多行数组：删除本插件元素行及其逗号，不改变其他行内容
- 删除后空数组：保留 `"plugin": []`

## CLI

- `opencode-lark-bridge uninstall`：项目级注销 + 删除 `<projectRoot>/.opencode/plugins/opencode-lark-bridge` 目录
- `opencode-lark-bridge uninstall --global|-g`：全局注销 + 删除 `~/.config/opencode/plugins/opencode-lark-bridge` 目录

## 文档

README.md 与 docs/PUBLISH.md 增加说明：npm 11+ 执行 `npm install` 时可能出现 allow-scripts 警告（postinstall 未覆盖），这是 npm 安全提示，postinstall 仍会自动执行；如需消除警告可运行 `npm approve-scripts opencode-lark-bridge`。
