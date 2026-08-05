## 1. README 卸载章节扩充

- [x] 1.1 将「卸载」章节拆为按安装方式组织的子节（npm install / 开发者本地安装 / opencode.jsonc 声明 npm 包名），保留并调整现有 `npx opencode-lark-bridge uninstall` 内容
- [x] 1.2 补充 opencode.jsonc 声明方式的卸载步骤：移除 `plugin` 数组条目、删除缓存目录、删除运行时配置文件、重启 OpenCode 生效
- [x] 1.3 补充作用边界说明：`npx opencode-lark-bridge uninstall` 不卸载 npm 包、不清理缓存；`opencode plugin` 无卸载子命令、`opencode uninstall` 卸载的是 OpenCode 本体
