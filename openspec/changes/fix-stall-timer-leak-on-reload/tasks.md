# Tasks

## Task 1: 为定时器泄漏写失败回归测试

- [x] 在 `tests/index.test.ts` 新增：
  - 「clears previous stall timer on plugin re-initialization」：spyOn 全局 `clearInterval`，部署配置后连续调用 `plugin()` 两次，断言 `clearInterval` 被调用（第二次初始化清理第一次的定时器）
- [x] 运行 `bun test tests/index.test.ts` 确认新测试失败（RED）：当前实现不清理旧定时器

## Task 2: 实现模块级定时器句柄

- [x] `src/index.ts`：模块级 `let stallTimer` 变量
- [x] `OpenCodeLarkBridge` 内创建新定时器前 `clearInterval(stallTimer)`（仅当非 null）
- [x] 重新运行新测试确认转绿（GREEN）
- [x] 运行 `npm run build`（tsc strict）与 `bun test` 全量回归
- [x] 提交 commit：`fix: clear stale stall timer on plugin re-initialization`
