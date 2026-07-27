## 1. 类型定义扩展

- [x] 1.1 在 `src/types.ts` 中扩展 `CategoryConfig` 接口，新增 `template_multiple?: string` 和 `question_item_template?: string` 字段

## 2. 默认模板定义

- [x] 2.1 在 `src/events/question-mapper.ts` 中定义 `DEFAULT_TEMPLATE_MULTIPLE` 常量
- [x] 2.2 在 `src/events/question-mapper.ts` 中定义 `DEFAULT_QUESTION_ITEM_TEMPLATE` 常量
- [x] 2.3 更新 `DEFAULT_TEMPLATE` 常量，改进 Options 格式（单独一行）

## 3. 核心功能实现

- [x] 3.1 实现 `applyIndent(template: string, varName: string, content: string): string` 函数，自动应用模板中的缩进到变量内容的每一行
- [x] 3.2 实现 `formatQuestionItem(q: QuestionInfo, index: number, template?: string): string` 函数，渲染单个问题项
- [x] 3.3 实现 `formatQuestions(questions: QuestionInfo[], itemTemplate?: string): string` 函数，拼接所有问题项
- [x] 3.4 重构 `mapQuestionEvent` 函数，支持多问题模板配置和选项自动缩进

## 4. 配置加载增强

- [x] 4.1 在 `src/config.ts` 中确保新配置字段被正确加载（依赖 comment-json 解析，无需额外代码）

## 5. 单元测试

- [x] 5.1 在 `tests/question-mapper.test.ts` 中添加"单问题 + 自定义模板"测试
- [x] 5.2 在 `tests/question-mapper.test.ts` 中添加"多问题 + 自定义所有模板"测试
- [x] 5.3 在 `tests/question-mapper.test.ts` 中添加"多问题 + 只配置单问题模板"测试
- [x] 5.4 在 `tests/question-mapper.test.ts` 中添加"不配置任何模板"测试
- [x] 5.5 在 `tests/question-mapper.test.ts` 中添加"空选项问题"测试
- [x] 5.6 在 `tests/question-mapper.test.ts` 中添加"选项截断"测试
- [x] 5.7 在 `tests/question-mapper.test.ts` 中添加"选项自动缩进"测试
- [x] 5.8 在 `tests/question-mapper.test.ts` 中添加"后缀变量定位"测试

## 6. 配置示例更新

- [x] 6.1 更新 `opencode-lark-bridge.config.example.jsonc`，添加 `template_multiple` 和 `question_item_template` 示例配置

## 7. 文档更新

- [x] 7.1 更新 `README.md`，说明新增的模板配置字段及其用法
- [x] 7.2 创建或更新 `docs/template-guide.md`，提供模板配置完整指南（可选）

## 8. 验证与集成测试

- [x] 8.1 运行 `bun test` 确保所有测试通过
- [x] 8.2 运行 `npm run build` 确保编译通过
- [x] 8.3 手动测试端到端场景：配置新模板字段 → 触发多问题事件 → 验证飞书通知格式
