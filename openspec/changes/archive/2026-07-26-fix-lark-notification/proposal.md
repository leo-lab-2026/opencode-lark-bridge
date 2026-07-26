# 修复飞书通知功能失效

## Why

编译后的 `opencode-lark-bridge` 插件安装在项目内后，OpenCode 的权限申请、任务完成等事件无法触发飞书通知。但在终端直接执行 `lark-cli im +messages-send` 命令可以正常发送消息，说明飞书 CLI 本身和 bot 凭证均无问题。需要排查插件加载、配置解析、事件路由和通知发送全链路，定位并修复导致通知失效的根因。

## What Changes

- 排查并修复插件编译、安装路径、配置加载、事件处理到 lark-cli 调用全链路中的问题
- 确保 OpenCode 的权限申请、任务完成等事件能够正确触发飞书通知
- 必要时补充测试或日志，防止同类问题复发

## Capabilities

### New Capabilities
- 无

### Modified Capabilities
- 无（本次修复仅涉及实现细节，不改变已有 spec 的验收场景）

## Impact

- 源码：`src/` 目录下的配置加载、事件处理、通知发送相关模块
- 构建产物：`dist/` 目录的完整性和正确性
- 插件安装路径：`.opencode/plugins/opencode-lark-bridge/`
- 配置文件：`opencode-lark-bridge.config.jsonc` 的解析与目标解析
