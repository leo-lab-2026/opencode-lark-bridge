---
comet_change: permission-notification-coverage
role: technical-design
canonical_spec: openspec
archived-with: 2026-07-08-permission-notification-coverage
status: final
---

# Design: Permission Notification Coverage

## Overview

Extend `opencode-lark-bridge` so that permission request notifications cover all OpenCode permission types: `read`, `edit`, `glob`, `grep`, `bash`, `task`, `skill`, `lsp`, `webfetch`, `websearch`, `external_directory`, `doom_loop`.

The existing template variables `{tool}`, `{operation}`, `{resource}` remain unchanged. The improvement is in `extractResource`, which now fills `{resource}` with the most specific identifier available for each permission type.

## Decisions

### 1. No new template variables

Keep the existing `{tool}` / `{operation}` / `{resource}` template contract. All permission-type-specific details flow into `{resource}`.

Rationale:
- Backward compatible: existing user configs continue to work and immediately benefit.
- Simpler implementation and smaller test surface.
- The default template is already resource-centric.

### 2. Resource extraction priority

`extractResource` in `src/events/permission-mapper.ts` is extended with a tool-aware branch before the existing fallback chain:

```
if tool is webfetch:
  args.url -> args.uri -> fallback
if tool is websearch:
  args.query -> fallback
if tool is task:
  args.type -> args.agent -> fallback
if tool is skill:
  args.name -> args.skill -> fallback
if tool is external_directory:
  args.path -> args.directory -> fallback
if tool is doom_loop:
  args.tool + args.input -> fallback
else:
  existing fallback chain
```

The fallback chain remains:
`metadata.filepath` -> `args.filePath` -> parsed `args.command` -> `patterns` -> `"unknown"`.

### 3. Dedupe key uses the same extracted resource

`dedupeKey` in `src/events/event-handler.ts` continues to use `tool:resource`, but `resource` is now the same value rendered in the notification. This prevents duplicate notifications for the same URL, query, or path within the debounce window.

### 4. Test coverage per permission type

Add one test case per permission type in `tests/permission-mapper.test.ts`. Each test asserts that the rendered message text contains the expected resource descriptor.

## Affected Files

- `packages/opencode-lark-bridge/src/events/permission-mapper.ts`
- `packages/opencode-lark-bridge/src/events/event-handler.ts` (dedupe key behavior remains, but verify with tests)
- `packages/opencode-lark-bridge/opencode-lark-bridge.config.example.jsonc`
- `packages/opencode-lark-bridge/README.md`
- `packages/opencode-lark-bridge/tests/permission-mapper.test.ts`
- `packages/opencode-lark-bridge/tests/event-handler.test.ts`

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| OpenCode event payload fields may shift across versions | Multi-field fallback chain; degrade to `"unknown"` rather than throwing |
| Field naming differs for the same permission type | Try common aliases (`url`/`uri`, `type`/`agent`, `name`/`skill`) |
| `doom_loop` structure is unknown | Extract `args.tool` + `args.input` if present, else fallback |

## Open Questions

1. Should `doom_loop` use a more alarming prefix (e.g. `⚠️`)? Current design leaves that to the user's template.
2. Is the `lsp` payload similar enough to generic tool events that the fallback chain is sufficient? This will be validated during implementation.
