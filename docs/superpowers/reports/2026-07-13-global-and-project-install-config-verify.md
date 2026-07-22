# Verification Report: global-and-project-install-config

## Summary

| Dimension    | Status                        |
| ------------ | ----------------------------- |
| Completeness | 9/9 tasks complete            |
| Correctness  | Requirements covered          |
| Coherence    | Matches proposal/design       |

- **Tests**: 55 pass / 0 fail (`bun test`)
- **Build**: `npm run build` exits 0
- **Shell syntax**: `bash -n` passes for both install scripts
- **Branch**: `feature/20260713/global-and-project-install-config`

## Root Cause / Goal

Unify project-level and global-level install paths for `opencode-lark-bridge`:
- Global config directory: `~/.config/opencode/`
- Global plugin directory: `~/.config/opencode/plugins/opencode-lark-bridge/`
- Project config directory: `<ctx.directory>/.opencode/`
- Plugin directory no longer holds config files.

## Changes Verified

| File | Change |
| ---- | ------ |
| `packages/opencode-lark-bridge/scripts/install-global.sh` | New global install script deploying to `~/.config/opencode/plugins/opencode-lark-bridge/` and seeding config at `~/.config/opencode/` |
| `packages/opencode-lark-bridge/scripts/install-local.sh` | Removed plugin-directory fallback config; only seeds `<project>/.opencode/` config |
| `packages/opencode-lark-bridge/src/index.ts` | `resolveConfigPath` only checks `<ctx.directory>/.opencode/` and `~/.config/opencode/`; `GLOBAL_OPENCODE_DIR` updated |
| `packages/opencode-lark-bridge/src/postinstall.ts` | `resolveTargetDir` global branch returns `~/.config/opencode/` |
| `packages/opencode-lark-bridge/tests/index.test.ts` | Project config paths use `.opencode/`; global paths use `~/.config/opencode/`; plugin-dir compat tests removed; new test ignores root-level config |
| `packages/opencode-lark-bridge/tests/postinstall.test.ts` | Global target dir assertion updated to `~/.config/opencode` |
| `packages/opencode-lark-bridge/README.md` | Global path, lookup order, and install instructions updated |
| `packages/opencode-lark-bridge/package.json` | Added `"install:global": "bash scripts/install-global.sh"` |

## Design Decision Adherence

- ✅ Configuration lookup limited to two candidates (`<ctx.directory>/.opencode/` → `~/.config/opencode/`).
- ✅ Plugin-directory compatibility paths removed.
- ✅ No-op fallback preserved when config is missing or invalid.
- ✅ Install scripts seed config at the correct level without overwriting existing files.

## Issues

### Critical
None.

### Important (Accepted)
- `de03ee0` mixes `src/index.ts` and `tests/index.test.ts` in one commit. Accepted: branch is functional and tested; noted for future task granularity.
- `resolveConfigPath` exported signature changed (removed `pluginDir`). Accepted: intentional per design; internal export with no public API compatibility promise.

### Minor (Accepted)
- `install-local.sh` and `install-global.sh` share near-identical build/copy logic. Accepted: clear per-script semantics; DRY extraction is future work.
- Plan document example test for global config uses `<globalDir>/.opencode/` while implementation uses `<globalDir>/`. Accepted: implementation is correct; plan doc example is non-deliverable.

## Final Assessment

All requirements implemented, all tests pass, build succeeds, design decisions followed. Ready for archive.
