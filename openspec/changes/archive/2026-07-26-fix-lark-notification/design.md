# 修复方案：飞书通知失效

## Context

`opencode-lark-bridge` 插件编译后安装到 `.opencode/plugins/opencode-lark-bridge/` 目录，但 OpenCode 运行时触发权限申请、任务完成等事件后，飞书端收不到通知。终端直接运行 `lark-cli` 命令可以成功发送，说明 CLI 和 bot 凭证正常。问题大概率出现在以下环节之一：

1. **编译产物不完整**：`dist/` 目录缺失必要文件或类型声明未正确生成
2. **安装路径/结构错误**：插件文件未按 OpenCode 期望的结构放置
3. **配置文件未找到或解析错误**：`opencode-lark-bridge.config.jsonc` 不在插件预期的查找路径
4. **事件 hook 未正确注册**：`src/index.ts` 返回的 hooks 未被 OpenCode 加载
5. **事件处理或通知发送逻辑异常**：handler 或 notifier 内部报错被静默吞掉

## Goals / Non-Goals

**Goals:**
- 定位并修复导致飞书通知无法触发的根因
- 确保权限申请、任务完成、问答等事件均能正常推送飞书消息
- 验证修复后通知链路端到端可用

**Non-Goals:**
- 不改动飞书 bot 凭证或 lark-cli 本身
- 不新增通知渠道或通知模板
- 不改变 OpenCode 插件的 public API 或事件协议

## Decisions

- **排查顺序**：编译产物 → 安装结构 → 配置加载 → 事件注册 → 事件处理 → 通知发送，由外到内逐步缩小范围
- **复现手段**：利用现有测试套件 + 手动模拟事件对象触发 handler，观察 notifier 是否执行 lark-cli 命令
- **修复原则**：最小改动，优先修复配置路径或编译脚本问题，必要时补充日志帮助后续排查

## Risks / Trade-offs

- [Risk] 修复后仍无法在真实 OpenCode 会话中验证（需要实际触发权限申请）
  → Mitigation：在单元测试中构造模拟事件对象，验证 handler 到 notifier 的完整调用链；在修复后手动运行 `npm run install:local` 并观察 OpenCode 实际行为
- [Risk] 根因可能涉及 OpenCode 核心加载逻辑，超出本插件范围
  → Mitigation：先穷尽插件侧所有可能，若确认插件本身无问题则记录证据并上报
