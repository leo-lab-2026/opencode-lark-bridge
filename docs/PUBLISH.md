# 发布流程

本文档描述 opencode-lark-bridge npm 包的发布流程。

## 发布前检查清单

- [ ] `npm run build` 编译无错误
- [ ] `bun test` 全部测试通过
- [ ] `npm run test:install` 本地安装验证通过
- [ ] `npm run pack:dry` 包内容只含 files 声明的文件
- [ ] `package.json` 的 `version` 已更新
- [ ] CHANGELOG 已更新（如有）

## 发布步骤

1. 确认工作区干净：`git status`
2. 更新版本号：
   ```bash
   npm version patch  # 或 minor / major
   ```
   此命令会自动 git commit + tag。
3. 发布到 npm：
   ```bash
   npm publish
   ```
   `prepublishOnly` 脚本会自动执行 build + test。
4. 推送代码和标签：
   ```bash
   git push --follow-tags
   ```
5. 创建 GitHub Release：
   - 从刚推送的 tag 创建 Release
   - 附 changelog 说明

## 版本管理

遵循语义化版本（SemVer）：

- **patch**（0.1.0 -> 0.1.1）：bug 修复
- **minor**（0.1.0 -> 0.2.0）：向后兼容的新功能
- **major**（0.1.0 -> 1.0.0）：不兼容的变更

## 回滚策略

- **72 小时内**：`npm unpublish opencode-lark-bridge@<version>`（npm 限制发布 72h 后不可 unpublish）
- **72 小时后**：`git revert` + 发布修复版本（递增 patch）

## 本地测试安装

发布前用 `scripts/test-install.sh` 验证完整安装流程：

```bash
npm run test:install
```

该脚本会：
1. `npm pack` 生成 tarball
2. 在临时目录执行项目级 `npm install <tarball>`
3. 验证插件文件、配置种子、plugin 注册
4. 清理后执行全局安装验证
5. 清理临时目录和全局安装
