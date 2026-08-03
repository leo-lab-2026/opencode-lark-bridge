## 1. README 新增「通过 opencode.jsonc 声明 npm 插件」章节

- [x] 1.1 在「开发者本地安装」之后、「配置」章节之前插入子章节「通过 opencode.jsonc 声明（免手动安装）」
- [x] 1.2 编写章节正文：`opencode.jsonc` 的 `plugin` 字段写法、OpenCode 自动安装机制说明（缓存目录 `~/.cache/opencode/packages/`、`ignoreScripts` 导致 postinstall 不执行）、与 `npm install` 方式的对比
- [x] 1.3 编写配置文件手动创建步骤（项目级 `<project>/.opencode/` 与全局 `~/.config/opencode/` 两处路径，从包内 `opencode-lark-bridge.config.example.jsonc` 复制并重命名的命令）
- [x] 1.4 编写避免双重注册提醒（不能同时保留 `./plugins/opencode-lark-bridge` 本地注册，否则双重通知）

## 2. README 新增「OpenCode agent 自动安装提示词」章节

- [x] 2.1 在「安装」章节末尾插入独立子章节「OpenCode agent 自动安装提示词」
- [x] 2.2 编写项目级安装提示词：目标配置文件路径、`opencode.jsonc` 的 `plugin` 字段写法、配置文件创建步骤、`lark-cli auth status` 前置检查、避免双重注册提醒
- [x] 2.3 编写全局安装提示词：目标配置文件路径、`opencode.jsonc` 的 `plugin` 字段写法、配置文件创建步骤、`lark-cli` 前置检查、避免双重注册提醒

## 3. 验证

- [x] 3.1 检查 README 渲染正确（标题层级、代码块、链接、表格）
- [x] 3.2 校对包名统一为 `opencode-lark-bridge`，无 `@leo-lab-2026/opencode-lark-bridge` 残留
