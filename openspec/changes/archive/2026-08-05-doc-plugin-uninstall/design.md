# Design: 补充插件卸载文档

## Context

- `src/installer.ts:139` 的 `uninstallPlugin`：删除插件目录（`.opencode/plugins/opencode-lark-bridge/` 或 `~/.config/opencode/plugins/opencode-lark-bridge/`）+ 从配置文件移除本地路径注册条目 `./plugins/opencode-lark-bridge`。不处理 npm 包、不清理 OpenCode 缓存。
- `opencode plugin <module>` CLI 只支持安装（写入配置 `plugin` 数组），无卸载子命令；`opencode uninstall` 卸载的是 OpenCode 本体。
- opencode.jsonc 声明 npm 包名方式：OpenCode 启动时经 `@npmcli/arborist` 安装到 `~/.cache/opencode/packages/<spec>/node_modules/`（README 第 104-116 行已记录），卸载即反向操作：移除配置条目 + 删除缓存目录。

## Goals / Non-Goals

**Goals:**
- 覆盖三种安装方式的卸载步骤：npm install、开发者本地安装、opencode.jsonc 声明 npm 包名
- 说明 `npx opencode-lark-bridge uninstall` 的作用边界（不卸载 npm 包、不清理缓存）
- 说明 OpenCode 自身 CLI 的边界（无插件卸载命令、`opencode uninstall` 是卸载本体）

**Non-Goals:**
- 不改动代码/CLI 行为（如为 `uninstallPlugin` 增加缓存清理功能）
- 不新增测试

## Decisions

- **单文件修改 README.md「卸载」章节**：按安装方式拆为三个子节（npm install / 开发者本地安装 / opencode.jsonc 声明），每节给出对应卸载命令与手动步骤，末尾加「作用边界与注意事项」说明。
- **opencode.jsonc 声明方式的卸载步骤**（以项目级为例，全局同理）：
  1. 从 `plugin` 数组移除 `"opencode-lark-bridge"` 条目（注意区别于 `"./plugins/opencode-lark-bridge"` 本地路径条目，两者都注册了时需要同时清理，避免双重加载）
  2. 删除缓存目录 `~/.cache/opencode/packages/opencode-lark-bridge@latest/`（以及不带 `@latest` 的旧版本遗留目录）
  3. 删除运行时配置 `.opencode/opencode-lark-bridge.config.jsonc`（或全局 `~/.config/opencode/opencode-lark-bridge.config.jsonc`）
  4. 重启 OpenCode 生效
- **沿用 README 现有小节风格**：代码块 + 短说明，与「通过 opencode.jsonc 声明（免手动安装）」章节的表格风格一致。

## Risks / Trade-offs

- 缓存目录的 spec 命名（`opencode-lark-bridge@latest` vs `opencode-lark-bridge`）随版本指定方式变化，文档以通配/示例说明，提示用户 `ls ~/.cache/opencode/packages/ | grep opencode-lark-bridge` 确认
- 文档与实现（`uninstallPlugin` 边界）可能随代码演进失同步；文档中明确标注命令边界，降低误用
