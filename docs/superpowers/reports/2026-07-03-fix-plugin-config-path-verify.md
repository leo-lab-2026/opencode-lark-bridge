# Verification Report: fix-plugin-config-path

## Summary

| Dimension    | Status                        |
| ------------ | ----------------------------- |
| Completeness | 5/5 tasks complete            |
| Correctness  | Bug fixed, tests pass         |
| Coherence    | Matches proposal/design       |

- **Tests**: 16 pass / 0 fail (`bun test`)
- **Build**: `npm run build` exits 0
- **Deployed plugin verification**: PASS — loaded config from `.opencode/plugins/opencode-lark-bridge/opencode-lark-bridge.config.jsonc`, logged initialization and notification attempt

## Root Cause

The deployed plugin at `.opencode/plugins/opencode-lark-bridge/` was hard-coded to look for configuration at `packages/opencode-lark-bridge/opencode-lark-bridge.config.jsonc` (relative to `ctx.directory`). Because the real config lived in the deployment directory, `loadConfig` threw "Config file not found" and the plugin silently returned a no-op event hook.

Additionally, `npm run install:local` deleted the entire plugin directory before re-copying compiled files, which wiped out the user's real config file and did not install runtime dependencies in the deployment directory.

## Changes Verified

| File | Change |
| ---- | ------ |
| `packages/opencode-lark-bridge/src/index.ts` | Resolves config from plugin module directory, with fallbacks to `ctx.directory` and source package layout |
| `packages/opencode-lark-bridge/tests/index.test.ts` | New test verifies config loading from `ctx.directory` |
| `packages/opencode-lark-bridge/scripts/install-local.sh` | Backups/restores user config, copies `package.json`/`bun.lock`, runs `bun install --production` in deployment dir |
| `packages/opencode-lark-bridge/package.json` | `install:local` now calls the shell script |
| `.gitignore` | Ignores `.omo/` platform state files |

## Issues

### SUGGESTION

1. **Shell argument escaping in `LarkNotifier`**
   - `src/notifier/lark-notifier.ts` builds a command string and executes it via `bash -c`. Backticks and `$` in templates could be interpreted by bash.
   - Recommendation: Use `Bun.spawn` with an array of arguments instead of `bash -c` to avoid shell interpretation. This is existing technical debt; not introduced by this fix.

## Final Assessment

No critical or important issues. The bug is fixed, the deployment process preserves user configuration and installs runtime dependencies, and all tests pass. Ready for archive.
