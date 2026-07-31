## 1. postinstall.ts 核心安装逻辑

- [ ] 1.1 抽取 `installPlugin(options: { global?: boolean })` 函数，封装完整安装逻辑（文件复制 + 依赖安装 + 配置种子 + 注册）
- [ ] 1.2 实现 `copyPluginFiles(targetPluginDir: string)` 函数，用 Node fs API 复制 dist/*、package.json、bun.lock、example config 到目标 plugins 目录
- [ ] 1.3 实现 `installDependencies(pluginDir: string)` 函数，优先 bun install --production，回退 npm install --production，均不可用时输出警告跳过
- [ ] 1.4 实现 `registerPluginConfig(options: { global: boolean; pluginPath: string })` 函数，用 comment-json 解析 JSONC 并写入 opencode.jsonc（项目级用相对路径，全局用绝对路径）
- [ ] 1.5 重写 `postinstall` 入口 `main()`：调用 `installPlugin({ global: isGlobalInstall() })`，所有步骤 catch 静默降级
- [ ] 1.6 保留现有 `initConfig`、`isGlobalInstall`、`resolveTargetDir` 函数，`installPlugin` 内部调用它们

## 2. cli.ts install 子命令

- [ ] 2.1 新增 `install` 命令分支，接受 `--global`/`-g` 标志
- [ ] 2.2 不带 `--global` 时调用 `installPlugin({ global: false })`，带时调用 `installPlugin({ global: true })`
- [ ] 2.3 更新 `printHelp()` 输出，增加 install 命令说明
- [ ] 2.4 处理 install 失败时输出错误提示但不崩溃

## 3. package.json npm 发布合规整改

- [ ] 3.1 补充发布合规字段：description、keywords、license(MIT)、repository(git+GitHub URL)、homepage、bugs、author
- [ ] 3.2 补充 `engines` 字段声明 Node >= 18
- [ ] 3.3 更新 `files` 字段，确保发布包含 dist/、opencode-lark-bridge.config.example.jsonc、README.md、package.json、bun.lock
- [ ] 3.4 新增 `prepublishOnly` 脚本（npm run build && bun test）
- [ ] 3.5 新增 `pack:dry` 脚本（npm pack --dry-run）
- [ ] 3.6 验证 postinstall 脚本在 npm 发布包内正确执行（条件检查 dist/postinstall.js 存在）

## 4. 测试

- [ ] 4.1 为 `installPlugin` 编写单元测试，验证文件复制、依赖安装调用、配置种子、注册逻辑
- [ ] 4.2 为 `copyPluginFiles` 编写测试，验证首次安装和重复安装覆盖行为
- [ ] 4.3 为 `registerPluginConfig`（TypeScript 版）编写测试，覆盖项目级和全局两种模式的已注册/未注册场景
- [ ] 4.4 为 CLI `install` 子命令编写测试，验证项目级和全局调用路径
- [ ] 4.5 验证现有 `initConfig`、`isGlobalInstall`、`resolveTargetDir` 测试仍通过
- [ ] 4.6 运行 `bun test` 确认全部测试通过

## 5. 发布流程文档

- [ ] 5.1 新增 `docs/PUBLISH.md`，覆盖发布前检查清单、发布步骤、版本管理策略、回滚策略、GitHub Release 关联
- [ ] 5.2 更新 README.md 安装说明，增加 npm install 用法和指向 docs/PUBLISH.md 的链接

## 6. 验证与收尾

- [ ] 6.1 运行 `npm run build` 确认 TypeScript 编译无错误
- [ ] 6.2 运行 `bun test` 确认全部测试通过
- [ ] 6.3 用 `npm pack --dry-run` 验证发布包内容只包含 files 声明的文件
- [ ] 6.4 用 `npm pack` 生成 tarball，在临时目录执行 `npm install <tarball>` 验证 postinstall 完整安装
- [ ] 6.5 验证 `npx opencode-lark-bridge install` 手动安装备选入口可用
