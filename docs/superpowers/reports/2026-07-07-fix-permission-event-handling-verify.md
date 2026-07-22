# Verification Report: fix-permission-event-handling

## Summary

| Dimension    | Status                        |
| ------------ | ----------------------------- |
| Completeness | 9/9 tasks complete            |
| Correctness  | Bug fixed, tests pass         |
| Coherence    | Matches proposal/design       |

- **Tests**: 21 pass / 0 fail (`bun test`)
- **Build**: `npm run build` exits 0
- **Deployed plugin verification**: PASS — plugin loads, receives `permission.asked` events, and sends Feishu notifications

## Root Cause

OpenCode 不会自动加载 `.opencode/plugins/` 下的本地插件，需要通过项目级 `opencode.json` 显式注册。此外，`permission.asked` 事件的真实结构与之前假设的 `tool`/`args` 结构不同，导致通知内容显示为 `[object Object]` 或 `unknown`。

## Changes Verified

| File | Change |
| ---- | ------ |
| `packages/opencode-lark-bridge/src/index.ts` | Remove startup `console.error` debug markers; keep silent initialization |
| `packages/opencode-lark-bridge/src/events/event-handler.ts` | Stop logging every non-permission event; only log permission-related events |
| `packages/opencode-lark-bridge/src/events/permission-mapper.ts` | Parse OpenCode `permission.asked` structure: `tool.callID`, `permission`, `metadata.filepath`, `patterns`; parse bash commands into verb + arguments |
| `packages/opencode-lark-bridge/tests/permission-mapper.test.ts` | Add tests for object tool and real OpenCode event structure |
| `packages/opencode-lark-bridge/opencode-lark-bridge.config.example.jsonc` | Use English template |
| `opencode.json` | Register local plugin for project-level loading |

## Verification Evidence

OpenCode 启动后插件初始化：

```
[INFO] Plugin initialized {"configPath":".../.opencode/plugins/opencode-lark-bridge/opencode-lark-bridge.config.jsonc"}
[INFO] Plugin hooks registered {"hooks":["event","permission.ask"]}
```

写入文件权限请求：

```
[DEBUG] Received permission.asked event {"eventType":"permission.asked","event":{"type":"permission.asked","properties":{"permission":"edit","patterns":["a.md"],"metadata":{"filepath":".../a.md"},"tool":{"callID":"write_78"}}}}
[INFO] Sending notification {"text":"🔔 OpenCode Permission Request\nTool: write\nOperation: edit\nTarget: .../a.md"}
[DEBUG] Executing lark-cli command {...}
```

Bash 权限请求：

```
[DEBUG] Received permission.asked event {"eventType":"permission.asked","event":{"type":"permission.asked","properties":{"permission":"bash","patterns":["rm \".../a.md\""],"metadata":{"command":"rm \".../a.md\""},"tool":{"callID":"bash_55"}}}}
[INFO] Sending notification {"text":"🔔 OpenCode Permission Request\nTool: bash\nOperation: rm\nTarget: \".../a.md\""}
```

用户确认：飞书接收到的通知内容符合预期。

## Issues

无 critical / important / warning 问题。

## Final Assessment

插件已能正确加载、解析 OpenCode 权限事件并向飞书发送准确通知。所有测试通过，部署验证通过。Startup 终端红字问题已消除。Ready for archive.
