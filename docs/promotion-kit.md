# FlowMind Promotion Kit

This file is for shipping posts faster without rethinking the positioning every time.

## One-Line Positioning

FlowMind is a memory and workflow automation layer for `MCP`, `Codex`, and `Claude Code`.

## What To Emphasize

- Reuse repeatable developer operations through skills
- Turn explicit feedback into reusable workflow state
- Expose the workflow through CLI and MCP-friendly entrypoints
- Reduce prompt repetition for internal engineering tasks

## Best-Fit Audience

- Engineers already using MCP-compatible internal tools
- Codex or Claude Code users with repeated operational workflows
- Teams doing log analysis, code review, data validation, and doc sync work

## Do Not Lead With

- "General AI agent"
- "Full autonomous coding"
- "Works for every workflow"

The product converts better when it is presented as a focused developer workflow tool.

## Demo CTA

Use one of these as the first command in posts:

```bash
npx flowmind@latest skills
npx flowmind@latest doctor
npm install -g flowmind
```

## Post Titles

### Chinese

- 我做了一个给 Codex / Claude Code 用的记忆层，专门减少重复 prompt
- 把开发工作流变成可复用技能：一个面向 MCP 的 CLI 工具
- 不想每次都重新教 AI 做日志排查，我做了个能记住流程的工具

### English

- I built a memory layer for Codex and Claude Code workflows
- Turn repeated developer operations into reusable MCP skills
- Stop rewriting the same prompts for log analysis and code review

## Ready-to-Post Copy

### Short Chinese Post

我做了一个 npm 包：`flowmind`，给已经在用 `MCP`、`Codex`、`Claude Code` 的团队减少重复 prompt。

它不是想做通用 Agent，核心更聚焦：

- 把重复工程任务路由到 skill
- 记录显式反馈
- 下次遇到类似场景直接复用

当前更适合这几类场景：

- 日志 / trace 排查
- 有固定标准的代码审查
- 通过 MCP 适配器串联内部工具

可以先试：

```bash
npx flowmind@latest skills
npx flowmind@latest doctor
```

仓库：`https://github.com/Eleven-M/flowmind`
npm：`https://www.npmjs.com/package/flowmind`

### Long Chinese Post

我最近做了一个 npm 包：`flowmind`。

它不是想替代通用 Agent，而是想解决一个更具体的问题：开发里很多操作其实是重复的，比如查日志、走 trace、按固定标准审查代码、同步文档、做数据校验。大家经常每次都重新写一遍 prompt，或者重新跟 AI 解释一遍流程。

FlowMind 的做法是：

- 把任务路由到 skill
- 通过 CLI / MCP 入口执行
- 记录你的显式反馈
- 下次在类似场景里直接复用

现在比较适合的场景是：

- 日志与链路排查
- 有明确顺序和标准的代码审查
- 通过 MCP 适配器串联内部工具

如果你本来就在用 `Codex`、`Claude Code`、或者自己的 MCP 工具链，这种“记忆层”会比一次次重写 prompt 更稳。

可以先这样试：

```bash
npx flowmind@latest skills
npx flowmind@latest doctor
```

仓库：`https://github.com/Eleven-M/flowmind`

如果你也有高频重复的开发流程，欢迎直接提 issue 或给我你的场景。

### English Post

I built `flowmind`, a CLI tool for repeatable developer workflows.

It is designed for teams already using `MCP`, `Codex`, `Claude Code`, or scriptable internal tooling.

Instead of treating every run like a fresh prompt, FlowMind tries to make the workflow reusable:

- route tasks to skills
- capture explicit feedback
- reuse preferences and workflow structure next time

Best-fit use cases right now:

- log / trace investigation
- code review with fixed standards
- internal tooling workflows exposed through MCP-compatible adapters

Try it:

```bash
npx flowmind@latest skills
npx flowmind@latest doctor
```

GitHub: `https://github.com/Eleven-M/flowmind`
npm: `https://www.npmjs.com/package/flowmind`

## Distribution Checklist

- Include one runnable command above the fold
- Lead with one concrete scenario, not a feature list
- Include the terminal GIF or a screenshot
- Link both GitHub and npm
- Ask for one specific kind of feedback: use case, install issue, or missing integration

## Good First Community Targets

- Juejin
- Zhihu
- X
- Reddit communities around MCP, AI tooling, CLI tools, and developer productivity
- Hacker News, only if the post leads with a concrete workflow problem
