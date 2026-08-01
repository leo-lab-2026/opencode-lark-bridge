# Outcome

通过 npm 安装（`npm install opencode-lark-bridge`）与卸载本插件时，opencode 配置注册行为正确、安全：

1. 项目级安装把插件注册信息写入项目级 opencode 配置文件（`.opencode/opencode.jsonc` 优先），不再错误写入 `node_modules/` 内。
2. 已存在的 opencode.jsonc/opencode.json（含其他配置内容）只做本插件条目的插入/修改/删除，绝不整体覆盖或重排其他内容。
3. CLI 提供 `uninstall` 命令，卸载时从配置文件删除本插件条目并删除已复制的插件目录。
4. npm 11 allow-scripts 警告通过文档说明，不改变 postinstall 行为。

# Scope

- 修复 `src/config-register.ts`：项目级配置查找基于项目根（INIT_CWD），优先级 `.opencode/opencode.jsonc` > `.opencode/opencode.json` > `./opencode.jsonc` > `./opencode.json`；全局级查找 `~/.config/opencode/opencode.jsonc` > `opencode.json`
- 移植 `scripts/lib/config-register.sh` 的文本级插入/删除逻辑到 TS（`config-register.ts`），保证对已有文件只修改本插件相关文本，不重排其他内容
- 新增 `unregisterPluginConfig`（按 global 区分，从配置文件中删除本插件条目，同样只动本插件相关文本）
- `src/installer.ts`：新增 `uninstallPlugin`（删除插件目录 + 调用 unregisterPluginConfig）
- `src/cli.ts`：新增 `uninstall [--global]` 命令
- `package.json`：不变（postinstall 保留）
- 文档：README.md 与 docs/PUBLISH.md 增加 allow-scripts 警告说明
- 测试：新增/更新 config-register、installer、cli 测试；更新 test-install.sh 的项目级安装验证（检查 `.opencode/opencode.jsonc` 存在）

# Non-goals

- 不改变 postinstall 自动部署机制（allow-scripts 警告保留，仅文档说明）
- 不新增 npm uninstall 生命周期钩子（删除能力仅通过 CLI 命令触发）
- 不删除或修改 shell 版 `scripts/lib/config-register.sh`（install-local.sh / install-global.sh 仍使用它）
- 不修改事件通知、配置加载等插件运行时行为

# Acceptance examples

1. 用户项目根执行 `npm install opencode-lark-bridge`（项目级）后：
   - `项目根/.opencode/opencode.jsonc` 存在且包含 `"plugin": ["./plugins/opencode-lark-bridge"]`
   - 若项目根 `.opencode/opencode.jsonc` 已存在含其他配置（如 `"model"`、注释），注册后其他内容与格式保持不变，仅 plugin 数组新增本插件
2. 用户项目根 `.opencode/opencode.json` 已存在（无 jsonc）时，项目级安装在该 json 文件添加插件条目，不创建 jsonc
3. 项目级 `opencode.jsonc` 已正确注册本插件时，重复安装不产生任何文件修改
4. 全局执行 `npm install -g opencode-lark-bridge` 后，`~/.config/opencode/opencode.jsonc` 存在且 plugin 数组包含本插件绝对路径；若该文件已存在其他内容，其他内容不变
5. 项目级执行 `npx opencode-lark-bridge uninstall` 后：项目 `.opencode/opencode.jsonc` 中本插件条目被删除（其他内容保留），`.opencode/plugins/opencode-lark-bridge` 目录被删除；若 plugin 数组删除后为空数组，保留 `"plugin": []`（不删除其他字段）
6. 全局执行 `npx opencode-lark-bridge uninstall --global` 后：`~/.config/opencode/opencode.jsonc` 中本插件条目被删除，`~/.config/opencode/plugins/opencode-lark-bridge` 被删除，其他内容保留
7. 配置文件中 plugin 为单行数组、多行数组、空数组、无 plugin 字段四种形态下，注册/卸载都只修改本插件相关文本，其他文本字节不变

# Constraints and invariants

- 事件 hook 只读；本次改动不涉及事件层
- 配置文件存在时禁止整体覆盖写入；只允许文本级修改本插件相关行（参考 shell 版 config-register.sh 的 sed 逻辑）
- 配置文件不存在时才允许创建新文件
- 注册判定：plugin 数组中存在等于或 endsWith 本插件路径的条目视为已注册
- `plugin` 字段删除本插件后若数组为空，保留 `"plugin": []`，不删除 plugin 字段本身
- 无 lint 配置；strict TS 零类型错误（tsc 通过）
- 测试命令：`bun test`（全量）、`npm run test:install`

# Decisions

- 问题一（allow-scripts 警告）：仅文档说明。npm 11 allow-scripts 是安全提示，已验证 postinstall 实际仍执行；在 README 与 docs/PUBLISH.md 说明警告无害及消除方法（`npm approve-scripts opencode-lark-bridge`）
- 删除能力：本次实现。新增 `unregisterPluginConfig` + CLI `uninstall [--global]` 命令
- 已有文件修改方式：文本级修改（参考 install-local.sh 使用的 shell 版 config-register.sh 逻辑，移植到 TS）。全局安装：存在全局配置则检查/插入/修改本插件条目，不存在则新建 `opencode.jsonc`；全局卸载：查找全部全局配置文件删除本插件条目。项目级安装：按优先级 `.opencode/opencode.jsonc` > `.opencode/opencode.json` > `./opencode.jsonc` > `./opencode.json` 查找；若存在已正确配置的文件则不修改；否则按优先级找到第一个存在的文件修改 plugin 添加；都不存在则创建 `.opencode/opencode.jsonc`。项目级卸载：按优先级查找全部项目级配置文件，删除本插件条目
- 卸载触发方式：仅 CLI 命令（不加 npm uninstall 钩子）
- 卸载范围：配置注册清理 + 删除插件目录（项目级 `.opencode/plugins/opencode-lark-bridge`，全局 `~/.config/opencode/plugins/opencode-lark-bridge`）

# Open questions

- 已确认共享理解（用户 2026-08-01 确认）：①allow-scripts 警告仅文档说明（postinstall 不变）②项目级安装的 opencode.jsonc 错误写入 node_modules 问题修复（用 INIT_CWD 定位项目根，优先级 .opencode/opencode.jsonc > .opencode/opencode.json > ./opencode.jsonc > ./opencode.json）③已有配置文件只文本级插入/修改/删除本插件条目，绝不整体覆盖 ④新增 unregisterPluginConfig + CLI uninstall [--global]（删配置条目 + 插件目录），仅 CLI 触发 ⑤全局查找 ~/.config/opencode/opencode.jsonc > opencode.json

# Verification expectations

- `bun test` 全量通过（含新增 config-register/installer/cli 测试）
- `npm run test:install` 全流程通过（含项目级安装后 `.opencode/opencode.jsonc` 存在与内容验证）
- 手工验证：项目级 npm install 后 `.opencode/opencode.jsonc` 存在于项目根且 node_modules 内无残留 `.opencode/`；含其他配置的既有 opencode.jsonc 注册/卸载后其他内容不变；全局安装/卸载路径验证
