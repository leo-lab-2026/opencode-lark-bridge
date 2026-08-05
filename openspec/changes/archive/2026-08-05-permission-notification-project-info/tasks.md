## 1. Mapper 支持 projectName

- [x] 1.1 `permission-mapper.ts`：DEFAULT_TEMPLATE 增加 `Project: {projectName}` 行
- [x] 1.2 `permission-mapper.ts`：`mapPermissionEvent` 渲染 `{projectName}`，缺失降级 `unknown`

## 2. 事件与 hook 注入

- [x] 2.1 `index.ts`：`enhanceEvent` 增加 `permission.asked` 分支，注入 projectName
- [x] 2.2 `index.ts`：`permission.ask` hook 构造带 projectName 的属性对象传给 `mapPermissionEvent`

## 3. 配置与文档

- [x] 3.1 `opencode-lark-bridge.config.example.jsonc`：permission 模板补 `Project: {projectName}`
- [x] 3.2 项目级与全局运行配置文件：permission.template 补 `{projectName}`（手动同步，不覆盖用户其他修改）
- [x] 3.3 README/配置说明文档：标注 permission 模板支持 `{projectName}` 变量

## 4. 测试

- [x] 4.1 `tests/permission-mapper.test.ts`：默认模板含 Project 行 + `{projectName}` 替换 + 缺失降级
- [x] 4.2 `tests/index.test.ts`：permission.ask hook 与 permission.asked 事件注入 projectName

## 5. 验证

- [x] 5.1 `npm run build` 通过（tsc 零错误）
- [x] 5.2 `bun test` 全部通过
