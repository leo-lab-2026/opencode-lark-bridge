import { describe, it, expect } from "bun:test"
import { mapQuestionEvent } from "../src/events/question-mapper"

describe("mapQuestionEvent", () => {
  // 单问题渲染
  it("renders single question with header, question, and options", () => {
    const event = {
      properties: {
        projectName: "My Project",
        questions: [
          {
            question: "What approach should we use?",
            header: "Architecture Decision",
            options: [
              { label: "A", description: "Monolith" },
              { label: "B", description: "Microservices" },
            ],
            multiple: false,
            custom: false,
          },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("My Project")
    expect(msg.text).toContain("Architecture Decision")
    expect(msg.text).toContain("What approach should we use?")
    expect(msg.text).toContain("• A: Monolith")
    expect(msg.text).toContain("• B: Microservices")
    expect(msg.target.chat_id).toBe("oc_1")
  })

  // 多问题渲染
  it("renders multiple questions with numbering", () => {
    const event = {
      properties: {
        projectName: "My Project",
        questions: [
          {
            question: "First question?",
            header: "Q1",
            options: [{ label: "A", description: "Option A" }],
          },
          {
            question: "Second question?",
            header: "Q2",
            options: [{ label: "B", description: "Option B" }],
          },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Multiple Questions (2)")
    expect(msg.text).toContain("1. Q1")
    expect(msg.text).toContain("First question?")
    expect(msg.text).toContain("2. Q2")
    expect(msg.text).toContain("Second question?")
  })

  // 多选提示
  it("shows (可多选) hint when multiple is true", () => {
    const event = {
      properties: {
        projectName: "Test",
        questions: [
          {
            question: "Pick many",
            header: "Multi",
            options: [
              { label: "A", description: "First" },
              { label: "B", description: "Second" },
            ],
            multiple: true,
          },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("(可多选)")
  })

  // 自定义输入提示
  it("shows (可自定义输入) hint when custom is true", () => {
    const event = {
      properties: {
        projectName: "Test",
        questions: [
          {
            question: "Custom input",
            header: "Custom",
            options: [{ label: "A", description: "First" }],
            custom: true,
          },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("(可自定义输入)")
  })

  // 无选项
  it("does not show Options line when no options", () => {
    const event = {
      properties: {
        projectName: "Test",
        questions: [
          {
            question: "No options here",
            header: "Open Question",
            options: [],
          },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).not.toContain("Options:")
  })

  // 截断保护 - question 超过 200 字符
  it("truncates question text at 200 characters", () => {
    const longQuestion = "A".repeat(250)
    const event = {
      properties: {
        projectName: "Test",
        questions: [
          {
            question: longQuestion,
            header: "Long Q",
            options: [{ label: "X", description: "Answer" }],
          },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    const truncated = "A".repeat(200) + "..."
    expect(msg.text).toContain(truncated)
    expect(msg.text).not.toContain(longQuestion)
  })

  // 截断保护 - options 超过 5 个
  it("truncates options at 5 and shows more count", () => {
    const options = Array.from({ length: 8 }, (_, i) => ({
      label: `Option${i + 1}`,
      description: `Description ${i + 1}`,
    }))
    const event = {
      properties: {
        projectName: "Test",
        questions: [
          {
            question: "Many options",
            header: "Long Options",
            options,
          },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("... (3 more)")
    // 前5个应该显示
    for (let i = 0; i < 5; i++) {
      expect(msg.text).toContain(`• Option${i + 1}: Description ${i + 1}`)
    }
    // 第6个之后不应显示
    expect(msg.text).not.toContain("Option6")
  })

  // 自定义模板
  it("uses custom template when provided", () => {
    const event = {
      properties: {
        projectName: "Test",
        questions: [
          {
            question: "Simple question",
            header: "Q",
            options: [],
          },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" }, "Custom: {header} | {question}")
    expect(msg.text).toBe("Custom: Q | Simple question")
  })

  // 默认模板
  it("renders with default template", () => {
    const event = {
      properties: {
        projectName: "My Project",
        questions: [
          {
            question: "What to do?",
            header: "Decision",
            options: [{ label: "A", description: "Do it" }],
          },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("❓ OpenCode Question")
    expect(msg.text).toContain("Project: My Project")
    expect(msg.text).toContain("Header: Decision")
    expect(msg.text).toContain("Decision")
    // 默认模板是 "Options:\n{options}"，所以选项在新行
    expect(msg.text).toContain("Options:\n• A: Do it")
  })

  // 字段缺失降级
  it("falls back projectName to unknown when missing", () => {
    const event = {
      properties: {
        questions: [
          {
            question: "Test",
            header: "Test",
            options: [],
          },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("Project: unknown")
  })

  // user_id target
  it("uses user_id target", () => {
    const event = {
      properties: {
        questions: [
          { question: "Q", header: "H", options: [] },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { user_id: "ou_1" })
    expect(msg.target.user_id).toBe("ou_1")
  })

  // 空 questions 数组
  it("handles empty questions array gracefully", () => {
    const event = {
      properties: {
        projectName: "Test",
        questions: [],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("No Questions")
  })

  // Issue 1: 问题文本包含 "Options: " 字面量但无选项时，不应删除该字面量
  it("preserves 'Options: ' literal in question text when options are empty", () => {
    const event = {
      properties: {
        projectName: "Test",
        questions: [
          {
            question: "Should we show Options: yes or no?",
            header: "Decision Point",
            options: [],
          },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    // 问题文本中的字面量 "Options: yes or no?" 应完整保留
    expect(msg.text).toContain("Should we show Options: yes or no?")
    // 但模板中的 "Options:" 行（后面跟选项）不应出现
    expect(msg.text).not.toMatch(/Options: [•(]/)
  })

  // Issue 2: 多问题模式下选项内联到问题文本下方
  it("inlines options after each question text in multi-question mode", () => {
    const event = {
      properties: {
        projectName: "My Project",
        questions: [
          {
            question: "Which approach?",
            header: "Q1",
            options: [
              { label: "A", description: "Method A" },
              { label: "B", description: "Method B" },
            ],
          },
          {
            question: "What name?",
            header: "Q2",
            options: [
              { label: "X", description: "Name X" },
            ],
          },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    // 选项应该内联到各自的问题文本下方
    expect(msg.text).toContain("Multiple Questions (2)")
    expect(msg.text).toContain("• A: Method A")
    expect(msg.text).toContain("• B: Method B")
    expect(msg.text).toContain("• X: Name X")
    // Options 行不应该单独出现（选项已内联）
    // 因为全是单问题选项，没有 "Options:" 独立行
  })

  // Issue 2: 多问题模式 custom:true 但无选项时，应显示 (可自定义输入) 提示
  it("shows (可自定义输入) hint for multi-question with custom but no options", () => {
    const event = {
      properties: {
        projectName: "Test",
        questions: [
          {
            question: "Enter DB name",
            header: "DB Config",
            options: [],
            custom: true,
          },
          {
            question: "Enter port",
            header: "Port",
            options: [],
            custom: true,
          },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("(可自定义输入)")
  })

  // 自定义模板格式: "Options:\n {options}" - 支持换行和空格缩进
  it("removes Options line with newline and space indent when no options", () => {
    const event = {
      properties: {
        projectName: "Test",
        questions: [
          {
            question: "Simple question",
            header: "Q",
            options: [],
          },
        ],
      },
    }
    const template = "❓ {header}\n{question}:\nOptions:\n {options}"
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" }, template)
    expect(msg.text).not.toContain("Options:")
    expect(msg.text).toBe("❓ Q\nSimple question:")
  })

  // 自定义模板格式: "Options:\n{options}" - 支持换行无空格
  it("removes Options line with newline without space when no options", () => {
    const event = {
      properties: {
        projectName: "Test",
        questions: [
          {
            question: "Simple question",
            header: "Q",
            options: [],
          },
        ],
      },
    }
    const template = "❓ {header}\n{question}:\nOptions:\n{options}"
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" }, template)
    expect(msg.text).not.toContain("Options:")
    expect(msg.text).toBe("❓ Q\nSimple question:")
  })

  // 自定义模板格式: "Options:\t{options}" - 支持制表符
  it("removes Options line with tab indent when no options", () => {
    const event = {
      properties: {
        projectName: "Test",
        questions: [
          {
            question: "Simple question",
            header: "Q",
            options: [],
          },
        ],
      },
    }
    const template = "❓ {header}\n{question}:\nOptions:\t{options}"
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" }, template)
    expect(msg.text).not.toContain("Options:")
    expect(msg.text).toBe("❓ Q\nSimple question:")
  })

  // 选项自动应用模板缩进
  it("applies template indent to options content", () => {
    const event = {
      properties: {
        projectName: "Test",
        questions: [
          {
            question: "Which approach?",
            header: "Decision",
            options: [
              { label: "A", description: "Method A" },
              { label: "B", description: "Method B" },
            ],
            custom: false,
          },
        ],
      },
    }
    const template = "Options:\n   {options}"
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" }, template)
    expect(msg.text).toBe("Options:\n   • A: Method A\n   • B: Method B")
  })

  // Task 4-6: 多问题使用自定义模板
  it("uses custom template_multiple for multiple questions", () => {
    const event = {
      properties: {
        projectName: "My Project",
        questions: [
          {
            question: "First question?",
            header: "Q1",
            options: [{ label: "A", description: "Option A" }],
          },
          {
            question: "Second question?",
            header: "Q2",
            options: [{ label: "B", description: "Option B" }],
          },
        ],
      },
    }
    const templateMultiple = "Project: {projectName}\nQuestions: {questions}"
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" }, undefined, templateMultiple)
    expect(msg.text).toContain("Project: My Project")
    expect(msg.text).toContain("Questions:")
    expect(msg.text).toContain("1. Q1")
    expect(msg.text).toContain("2. Q2")
  })

  // Task 4-6: 多问题使用自定义 question_item_template
  it("uses custom question_item_template for each question item", () => {
    const event = {
      properties: {
        projectName: "My Project",
        questions: [
          {
            question: "Which approach?",
            header: "Q1",
            options: [
              { label: "A", description: "Method A" },
              { label: "B", description: "Method B" },
            ],
          },
          {
            question: "Which name?",
            header: "Q2",
            options: [
              { label: "X", description: "Name X" },
            ],
          },
        ],
      },
    }
    const itemTemplate = "[{number}] {header}: {question} | {options} | {suffix}"
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" }, undefined, undefined, itemTemplate)
    expect(msg.text).toContain("[1] Q1")
    expect(msg.text).toContain("Which approach?")
    expect(msg.text).toContain("Method A")
    expect(msg.text).toContain("[2] Q2")
  })

  // Task 4-6: 单问题使用自定义模板（无模板参数，使用默认）
  it("single question uses default template when no custom template provided", () => {
    const event = {
      properties: {
        projectName: "Test",
        questions: [
          {
            question: "Simple question?",
            header: "Q",
            options: [{ label: "A", description: "Option A" }],
          },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("❓ OpenCode Question")
    expect(msg.text).toContain("Project: Test")
    expect(msg.text).toContain("Q")
    expect(msg.text).toContain("Simple question?")
  })

  // Task 4-6: 空选项处理 - suffix 变量在模板中
  it("shows suffix hints when options are empty but suffix is in template", () => {
    const event = {
      properties: {
        projectName: "Test",
        questions: [
          {
            question: "Enter name",
            header: "Name",
            options: [],
            custom: true,
          },
        ],
      },
    }
    const template = "{header}: {question} | {suffix}"
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" }, template)
    expect(msg.text).toContain("Name: Enter name")
    expect(msg.text).toContain("(可自定义输入)")
  })

  // Task 4-6: 后缀变量自由定位 - 在模板中间
  it("places suffix at arbitrary position in template", () => {
    const event = {
      properties: {
        projectName: "Test",
        questions: [
          {
            question: "Select options",
            header: "Multi",
            options: [
              { label: "A", description: "First" },
              { label: "B", description: "Second" },
            ],
            multiple: true,
            custom: true,
          },
        ],
      },
    }
    const template = "{header} {suffix} - {question}"
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" }, template)
    // 当模板不包含 {options} 变量时，suffix 应该显示"(可自定义输入)"提示
    expect(msg.text).toContain("Multi (可多选) (可自定义输入) - Select options")
  })

  // Task 4-6: 选项截断 - 在 question_item_template 中
  it("truncates options in question_item_template", () => {
    const options = Array.from({ length: 8 }, (_, i) => ({
      label: `Option${i + 1}`,
      description: `Description ${i + 1}`,
    }))
    const event = {
      properties: {
        projectName: "Test",
        questions: [
          {
            question: "Many options",
            header: "Q1",
            options,
          },
        ],
      },
    }
    const itemTemplate = "{number}. {question}\nOptions: {options}"
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" }, undefined, undefined, itemTemplate)
    expect(msg.text).toContain("... (3 more)")
    // 前5个应该显示
    for (let i = 0; i < 5; i++) {
      expect(msg.text).toContain(`Option${i + 1}`)
    }
    // 第6个之后不应显示
    expect(msg.text).not.toContain("Option6")
  })

  // Task 4-6: 无问题场景 - 使用单问题模板，变量为空
  it("handles no questions with empty variables", () => {
    const event = {
      properties: {
        projectName: "Test",
        questions: [],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("No Questions")
    expect(msg.text).toContain("Project: Test")
  })

  // Task 4-6: 多问题场景 - suffix 在每个问题项中
  it("shows suffix hints for each question in multi-question mode", () => {
    const event = {
      properties: {
        projectName: "Test",
        questions: [
          {
            question: "Pick one",
            header: "Q1",
            options: [{ label: "A", description: "Option A" }],
            multiple: true,
          },
          {
            question: "Enter value",
            header: "Q2",
            options: [],
            custom: true,
          },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("(可多选)")
    expect(msg.text).toContain("(可自定义输入)")
  })

  // Task 7: 配置优先级验证 - 配置值 > 默认值
  it("uses config templates over defaults when provided", () => {
    const event = {
      properties: {
        projectName: "My Project",
        questions: [
          {
            question: "Which approach?",
            header: "Q1",
            options: [{ label: "A", description: "Option A" }],
          },
          {
            question: "Which name?",
            header: "Q2",
            options: [{ label: "X", description: "Name X" }],
          },
        ],
      },
    }
    const templateMultiple = "自定义多问题模板: {projectName} - {questions}"
    const itemTemplate = "[第{number}题] {header}"
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" }, undefined, templateMultiple, itemTemplate)
    expect(msg.text).toContain("自定义多问题模板: My Project")
    expect(msg.text).toContain("[第1题] Q1")
    expect(msg.text).toContain("[第2题] Q2")
    expect(msg.text).not.toContain("❓ OpenCode Question")
  })

  // Task 7: 默认模板格式验证
  it("uses correct default template format for single question", () => {
    const event = {
      properties: {
        projectName: "Test Project",
        questions: [
          {
            question: "What to do?",
            header: "Decision",
            options: [
              { label: "A", description: "Option A" },
              { label: "B", description: "Option B" },
            ],
            multiple: true,
            custom: true,
          },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("❓ OpenCode Question")
    expect(msg.text).toContain("Project: Test Project")
    expect(msg.text).toContain("Header: Decision")
    expect(msg.text).toContain("What to do?")
    expect(msg.text).toContain("Options:")
    expect(msg.text).toContain("• A: Option A")
    expect(msg.text).toContain("• B: Option B")
    expect(msg.text).toContain("(可多选)")
    expect(msg.text).toContain("(可自定义输入)")
  })

  // Task 7: 默认模板格式验证 - 多问题
  it("uses correct default template format for multiple questions", () => {
    const event = {
      properties: {
        projectName: "Test Project",
        questions: [
          {
            question: "First?",
            header: "Q1",
            options: [{ label: "A", description: "Opt A" }],
          },
          {
            question: "Second?",
            header: "Q2",
            options: [{ label: "B", description: "Opt B" }],
          },
        ],
      },
    }
    const msg = mapQuestionEvent(event, { chat_id: "oc_1" })
    expect(msg.text).toContain("❓ OpenCode Question")
    expect(msg.text).toContain("Project: Test Project")
    expect(msg.text).toContain("Multiple Questions (2)")
    expect(msg.text).toContain("1. Q1")
    expect(msg.text).toContain("   First?")
    expect(msg.text).toContain("2. Q2")
    expect(msg.text).toContain("   Second?")
  })
})