# Acceptance evidence

<!-- comet-native:acceptance-evidence:start -->
[
  {
    "acceptance_id": "acceptance-43dd4ccc2cfa1ea0dcec95fcee3b0b7bddd73157c4653bd08b5d336bf9cacd28",
    "evidence_refs": [
      "tests/config-register.test.ts",
      "tests/installer.test.ts"
    ]
  },
  {
    "acceptance_id": "acceptance-90f2261aad0348ff7df22e67bcd37b5042e0e7b8708417960dc048dca7c5f301",
    "evidence_refs": [
      "tests/cli.test.ts",
      "tests/config-register.test.ts",
      "tests/installer.test.ts"
    ]
  }
]
<!-- comet-native:acceptance-evidence:end -->

# Commands and results

## bun test（全量单元测试）

```
149 pass / 0 fail（317 expect）
```

新增用例覆盖：INIT_CWD 项目根定位、配置文件优先级（.opencode/opencode.jsonc > .opencode/opencode.json > ./opencode.jsonc > ./opencode.json）、注释保留、已注册跳过、无 plugin 字段插入（含补逗号）、多行数组追加、空数组填入、单行/多行数组删除、空数组保留、未注册不动、jsonc+json 都清理、uninstallPlugin 删目录+注册、CLI runUninstall 参数与错误捕获。

## npm run test:install（集成安装验证）

```
148+ pass / 0 fail
✓ All install tests passed
```

新增验证：项目级安装后 `.opencode/opencode.jsonc` 存在且含插件；`node_modules/opencode-lark-bridge/.opencode` 无泄漏。

## 端到端手工验证（/tmp/opencode/e2e 隔离环境）

1. 新目录项目级 npm install：opencode.jsonc 创建于项目根，含 `"./plugins/opencode-lark-bridge"`；node_modules 内无 .opencode 泄漏
2. 已有配置（注释+model+agent+其他 plugin 多行数组）：注册后其他内容与格式字节级不变，仅追加本插件
3. 单行数组 `["a","b"]` → 追加成功；空数组 `[]` → 填入成功
4. 无 plugin 字段：插入 plugin 字段并自动补前一属性逗号，comment-json parse 校验合法
5. 重复运行 postinstall：`Plugin already registered`，文件不变（幂等）
6. CLI uninstall（项目级）：插件目录删除、plugin 数组仅移除本插件、其他内容字节级保留
7. 全局安装/卸载（HOME=/tmp/opencode/ghome 隔离）：全局 opencode.jsonc 追加绝对路径条目；uninstall --global 删除条目+插件目录，其他内容保留
8. registerPluginText/unregisterPluginText 单行/多行/空数组/无 plugin/唯一元素/开头/末尾边界用例输出正确

# Skipped checks

无。所有计划验证均已执行。

# Spec consistency

- 配置查找优先级与 spec 一致（项目级 4 候选、全局 jsonc > json）
- 文本级修改约束（存在文件禁止整体覆盖，只动本插件条目）与 spec 一致
- uninstall 范围（配置条目 + 插件目录）与 spec 一致
- allow-scripts 仅文档说明，postinstall 行为未改，与 spec 一致
- 注册判定（等于或 endsWith 匹配）与 spec 一致

# Known limitations and risks

1. **index.test.ts 既有 flaky 测试**：真实调用 lark-cli 发送飞书消息，网络间歇超时（10s）。通过 `git stash` 验证与本次改动无关（stash 后同样失败）。lark-cli 进程偶发悬挂导致 test:install 超时，清理进程后恢复。
2. **npm 11 allow-scripts 警告**：postinstall 实际执行，警告仅为安全提示，已文档说明。
3. **全局 opencode.jsonc 历史污染**：用户真实全局 `~/.config/opencode/opencode.jsonc` 在先前 change 的 test:install 运行时被写入（2026-08-01 11:50:47，仅含 $schema+plugin 133 字节）。若此前有其他配置内容无法恢复（该目录非 git 仓库）。本次修复后注册/卸载仅文本级修改，不再可能整体覆盖。
4. **tgz 构建产物**：opencode-lark-bridge-0.1.0.tgz 被 7467db7 误提交 git，本次从 git 移除并加入 .gitignore（用户已确认接受 partial scope）。

# Conclusion

所有验收项 PASS。三个问题全部解决：allow-scripts 警告已文档化；项目级安装 opencode.jsonc 正确写入项目根（不再泄漏到 node_modules）；已有配置文件仅文本级修改本插件条目，绝不整体覆盖；新增 uninstall 命令支持配置与插件目录清理。
