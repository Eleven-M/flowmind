# FlowMind 详细指南

这份文档是 npm 首页的长说明版本。
如果你想看更完整的产品阐述、使用方式和系统模型，就从这里继续。

## 核心思路

FlowMind 面向的是可重复出现的开发操作。
它不是让你每次都重写一遍指令，而是把工作交给 skill，再通过已配置的 adapter 或 MCP 兼容提供者执行，并把显式反馈沉淀为可复用的本地状态。

最短链路可以概括为：

1. 接收请求
2. 选择 skill
3. 通过 adapter / integration 执行
4. 记录显式反馈
5. 在相似请求里复用这些反馈

## 使用方式

### CLI

默认方式就是直接通过命令行使用：

```bash
flowmind "查询 traceId abc123 的日志"
flowmind "审查代码质量"
flowmind process --skill log-audit "查询最近1小时的错误日志"
```

如果你想先最快跑通，这是最直接的入口。

如果你要把本机 `SDD-Agent` 的资源配置和场景映射导入到 FlowMind，请显式执行：

```bash
flowmind resource --sync-sdd-agent
```

查看当前已经学习的技能反馈、规则、场景、资源绑定和本地资料包元数据：

```bash
flowmind learn --assets
flowmind learn --assets --skill log-audit --json
```

受保护的后续工作流可以通过本地历史恢复：

```bash
flowmind workflow --chain follow-up-chain.json
flowmind workflow --chain follow-up-chain.json --execute --approval-token <token>
flowmind workflow-history
flowmind workflow-history --status failed --resumable
flowmind workflow-resume --execution-id <id> --approval-token <token>
```

出于安全考虑，跨工作区自动同步默认关闭；只有在你明确设置 `FLOWMIND_ENABLE_SDD_AGENT_AUTO_SYNC=1` 时，初始化阶段才会自动同步。

### 面向 Codex 的 JSON 输出

如果你的上层工具需要结构化输出：

```bash
flowmind-codex "查询最近1小时的错误日志"
flowmind-codex --skill log-audit "查询 traceId abc123 的完整链路"
flowmind process --json "查询日志"
```

这更适合自动化脚本、CI 或工具编排。

### MCP 客户端接入

FlowMind 可以作为 MCP Server 暴露给 Claude Code、Cursor、Windsurf、Cline 等工具使用。
具体接入步骤见 [integration-guide.md](integration-guide.md)。

### AI 增强路由

FlowMind 也可以接在模型前面，利用模型能力做意图理解、参数提取、skill 选择和结果摘要。
这样复杂自然语言请求会更顺，但执行路径仍然以 skill 为核心。

## 它是怎么工作的

### 1. Skill 路由

每个请求先匹配到一个可复用 skill。
这样执行路径是稳定的，而不是每次都重新组织 prompt。

### 2. Adapter 执行

skill 再去调用真正干活的 adapter 或 provider，比如日志、数据库、API 文档、知识库和工作流系统。

### 3. 从显式反馈学习

FlowMind 重点学习的是显式反馈。
例如：

```text
用户："下次用表格格式"
FlowMind：记录这条偏好
```

之后遇到相似请求时，就可以从本地学习数据里复用。

### 4. 本地复用

这层学习机制的目标是减少重复，而不是隐藏执行过程。
你依然可以查看 skill、显式控制执行，并保持流程可脚本化。

用户显式指定的技能也会成为路由学习。`process --skill <name>` 成功执行后会保存“请求 → 技能”映射；交互对话中说“这个应该改用 `<name>`”则会学习上一轮请求。之后完全相同或动作类型一致且高度相似的请求，会在模型和普通关键词路由之前复用该映射。学习数据可通过 `flowmind learn --assets --json` 查看，并随 learning bundle 导入导出。

路由会区分“分析流程”和“执行流程”：分析、梳理、总结业务流程属于资料/代码分析；执行、部署、运行或查询流水线状态属于自动化工作流。

TUI 顶部会提前展示技能可用性：`✓` 表示当前可用，`⚠` 表示缺少 MCP 绑定或 Git 仓库上下文，`○` 表示技能被配置为禁用。`Bind:` 行会直接列出 `技能 -> 缺失组件`，例如 `auto-flow->workflow`，让用户在执行前就知道需要配置什么。MCP 状态是本地配置就绪检查，不会在界面渲染时发送远程探测请求。

### 5. 无模型离线分析

`offline-design-analysis` 可以在没有 AI provider 时读取本地学习记录、Markdown、HTML/Lake、Lakebook 和常见代码文件，按自然语言检索并输出带证据的设计流程：

```bash
flowmind analyze "分析历史资料和代码，总结设计流程" --offline --json
```

该模式不联网、不执行被分析代码，并会明确输出置信度和推断限制。

它不是有模型分析的默认技能。模型可用时，普通“分析流程”请求会保留在 AI 路由；只有无可用模型、明确要求“离线/不用 AI”，或用户显式指定该技能时才进入离线分析。

## 架构概览

FlowMind 可以粗分为四层：

1. CLI / MCP 入口层
2. skill 路由与执行层
3. provider / adapter 集成层
4. 学习与偏好复用层

常见组件族包括：

- `logService`
- `databaseManager`
- `databaseQuery`
- `redisMonitor`
- `apiDoc`
- `knowledgeBase`
- `workflow`
- `report`

它的实际目标是通过配置切换后端，而不是为了换一个后端就重写 skill 逻辑。

## 最适合的场景

### 日志与链路排查

```bash
flowmind "排查线上问题 traceId abc123"
```

适合那类经常重复出现、步骤相对稳定的问题排查。

### 代码审查

```bash
flowmind "代码审查先检查安全漏洞，再检查代码质量"
flowmind "审查这个 PR"
```

适合团队已经有固定审查顺序或标准的情况。

### 数据校验

```bash
flowmind "验证订单数据"
flowmind "检查金额计算逻辑"
```

适合日志、数据库状态和业务逻辑需要反复联合验证的场景。

## 什么情况下值得用

如果满足下面几条，FlowMind 通常比较合适：

- 你已经有内部工具，只是缺一个稳定的执行入口
- 某几类排查、审查、校验任务会反复出现
- 你希望反馈能脱离聊天记录，变成可复用状态

如果是下面这些情况，FlowMind 反而不是最优解：

- 你只需要一个通用聊天助手
- 每个任务都是一次性的，从不重复
- 你期待在没有任何配置和技能的前提下完全自治式开发

## 下一步看哪里

- 终端演示： [../demo/DEMO_CN.md](../demo/DEMO_CN.md)
- 集成接入： [integration-guide.md](integration-guide.md)
- 升级契约： [upgrade-contracts.zh-CN.md](upgrade-contracts.zh-CN.md)
- 版本更新： [../CHANGELOG.md](../CHANGELOG.md)
