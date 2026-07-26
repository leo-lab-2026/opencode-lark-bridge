# Proposal: 使 .gitignore 修改生效并提交到远程

## 问题描述

根目录的 `.gitignore` 已更新，加入了 `dist/`、`.codegraph/`、`src/logs/`、`logs/`、`.opencode/plugins/`、`opencode-lark-bridge.config.jsonc` 等忽略规则。但这些规则仅对未跟踪的新文件生效；对于之前已被 Git 跟踪的文件/目录，`.gitignore` 不会自动将其从索引中移除，导致忽略规则"不起作用"。

## 根因分析

Git 的忽略机制分两层：
1. 未跟踪文件 → `.gitignore` 直接生效
2. 已跟踪文件 → 必须先从索引中移除（`git rm --cached`），`.gitignore` 才对其生效

当前仓库中 `.codegraph/.gitignore` 仍处于跟踪状态，而 `.codegraph/` 已写入 `.gitignore`，因此需要显式清理。

## 修复目标

1. 将已跟踪但应被忽略的文件从 Git 索引中移除（保留本地文件）
2. 暂存 `.gitignore` 本身的变更
3. 提交并推送至远程 `main` 分支
