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
- 版本更新： [../CHANGELOG.md](../CHANGELOG.md)
