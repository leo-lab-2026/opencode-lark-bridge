# Brainstorm Summary

- Change: install-local-config-registration
- Date: 2026-07-28

## 确认的技术方案

**优雅降级策略：jq 优先 + grep/sed 回退**

1. **jq 依赖**：非强制。jq 可用时用于精确检查，不可用时用 grep 回退。写入逻辑完全不依赖 jq。
2. **JSONC 注释剥离**：awk 逐字符解析，判断字符串内外状态，只剥离双引号外的 `//` 注释。仅用于检查阶段。
3. **检查逻辑**：
   - jq 可用：剥离注释 → jq 解析 → 检查 `plugin` 数组是否包含插件路径
   - jq 不可用：grep 字符串匹配 `PLUGIN_PATH`（降级，可能误判但安全）
4. **写入逻辑**：保留原文件，用 sed 定点修改。4 种场景：
   - 文件不存在 → 创建新文件（含 $schema + plugin）
   - 无 plugin 字段 → sed 在最后一行 `}` 前插入
   - plugin 数组为空 `[]` → sed 替换为 `["$PLUGIN_PATH"]`
   - plugin 数组有元素 → sed 在 `]` 前插入 `, "$PLUGIN_PATH"`
5. **全局配置**：只读检查，不写入。
6. **容错**：解析失败输出警告并跳过，不中断安装。

## 关键取舍与风险

- **jq 非强制 vs 精确性**：无 jq 时 grep 可能误判（路径出现在注释中），但极少见且后果仅为跳过写入
- **awk 注释剥离 vs python**：awk 更通用（POSIX 标准），无需 python3
- **sed 定点修改 vs jq 全量重写**：sed 保留注释，但数组边界处理需要精心设计正则
- **风险**：sed 对复杂 JSONC 格式的数组边界判断可能不完美 → 缓解：分场景测试覆盖

## 测试策略

- 6 个场景手动测试：已注册跳过、全局已注册跳过、写入 jsonc、写入 json、创建新文件、格式损坏容错
- 验证注释保留：写入前后对比注释完整性
- 验证全局配置未被修改

## Spec Patch

无（OpenSpec delta spec 已覆盖所有场景）
