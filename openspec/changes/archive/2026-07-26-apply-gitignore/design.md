# Design: .gitignore 生效方案

## 方案

采用 `git rm --cached` 对已跟踪但应被忽略的文件进行索引清理，然后提交 `.gitignore` 更新。

### 具体步骤

1. 扫描仓库中已跟踪但匹配新 `.gitignore` 规则的文件/目录
   - 当前命中项：`.codegraph/.gitignore`
2. 执行 `git rm --cached <paths>` 从索引移除，保留工作区文件
3. 执行 `git add .gitignore` 暂存配置更新
4. 执行 `git commit -m "fix: 更新 .gitignore 并清理已跟踪的忽略项"`
5. 执行 `git push origin main` 推送至远程

## 回滚策略

若误删，可通过 `git checkout HEAD -- <file>` 从最近一次提交恢复索引状态；`git rm --cached` 不删除工作区文件，风险极低。
