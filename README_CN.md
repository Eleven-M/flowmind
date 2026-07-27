<div align="center">

# 🧠 FlowMind

### **学习你工作方式的 AI 智能体**

*面向 MCP、Codex、Claude Code 的记忆层与工作流自动化工具。*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![npm version](https://img.shields.io/npm/v/flowmind.svg)](https://www.npmjs.com/package/flowmind)
[![npm downloads](https://img.shields.io/npm/dw/flowmind.svg)](https://www.npmjs.com/package/flowmind)

[English](README.md) | [快速开始](#快速开始) | [演示](#无需配置的演示) | [技能目录](docs/skills-catalog.md) | [详细指南](docs/guide.zh-CN.md) | [集成指南](docs/integration-guide.zh-CN.md) | [更新记录](CHANGELOG.md)

</div>

---

## 它是什么

FlowMind 是一个面向重复开发工作流的记忆层。

它适合这样一类场景：你已经有工具，但希望执行入口更稳定：

- 把重复任务路由到可复用的 skill
- 把显式反馈沉淀下来，下次自动复用
- 让同一套工作流同时可用于 CLI、Codex 和 MCP 客户端
- 通过受保护 workflow 审计和变更多云微服务治理策略

当前最适合的使用方向：

- 日志与 trace 排查
- 有固定标准的代码审查
- 数据校验和内部工具串联

## 快速开始

```bash
npm install -g flowmind
flowmind doctor
flowmind demo log-audit
flowmind demo code-review
flowmind skills
flowmind process --skill log-audit "查询最近的错误日志"
```

如果你要给 Codex 或脚本消费 JSON：

```bash
flowmind-codex skills
flowmind-codex --skill log-audit "查询 traceId abc123 的日志"
```

如果你更想先用 `npx` 试一下：

```bash
npx flowmind@latest doctor
npx flowmind@latest demo log-audit
npx flowmind@latest skills
```

运行时支持 Node.js 18 及以上版本。贡献者开发工具建议使用 Node.js 20.19 或更高版本。

## 无需配置的演示

![FlowMind terminal demo](demo/flowmind-demo.gif)

在接入任何 provider 或 MCP server 之前，可以先运行内置 mock demo：

```bash
flowmind demo log-audit
flowmind demo code-review
flowmind demo workflow
flowmind demo log-audit --json
```

这些 demo 不依赖 SLS、数据库、内部平台或 AI provider 凭证。

## 能力边界

| 能力 | 开箱可用 | 需要配置 |
| --- | --- | --- |
| Skill 发现 | `flowmind skills` | 无 |
| Mock demo | `flowmind demo log-audit`、`flowmind demo code-review`、`flowmind demo workflow` | 无 |
| 学习数据查看 | `flowmind learn --assets` | 本地 FlowMind 状态 |
| 日志、数据、文档、workflow skill | skill 路由和结果契约 | MCP server、provider 凭证或 adapter |
| 多云治理 | 受保护 workflow 契约 | provider-specific MCP governance adapter |

## 本地状态

FlowMind 默认把本地配置和学习数据存放在 `FLOWMIND_HOME/.flowmind` 下。
如果没有设置 `FLOWMIND_HOME`，则回落到当前用户主目录。

如果你要导入本机 `SDD-Agent` 的资源配置和场景映射，请显式执行：

```bash
flowmind resource --sync-sdd-agent
```

出于安全考虑，跨工作区自动同步默认关闭；只有在你明确设置 `FLOWMIND_ENABLE_SDD_AGENT_AUTO_SYNC=1` 时，初始化阶段才会自动同步。

可能包含凭证或 workflow 状态的文件会在 POSIX 文件系统上使用私有权限写入。详见 [SECURITY.md](SECURITY.md) 和 [docs/security-model.md](docs/security-model.md)。

## 为什么它比直接写 Prompt 更稳

- skill 提供稳定执行路径，而不是每次重新组织 prompt
- 显式反馈会沉淀成状态，而不是停留在聊天记录里
- CLI / MCP 入口让工作流更容易脚本化和复用

## 一个真实例子

```bash
flowmind process --skill log-audit "查询 traceId abc123 的日志"
flowmind "下次用表格格式"
```

下次遇到相似请求时，FlowMind 可以从本地学习数据里复用这条显式偏好。

## 按目标阅读

- 想看完整产品说明： [docs/guide.zh-CN.md](docs/guide.zh-CN.md)
- 想看 skill 能力矩阵： [docs/skills-catalog.md](docs/skills-catalog.md)
- 想新增 provider 或 adapter： [docs/provider-adapter-guide.md](docs/provider-adapter-guide.md)
- 想看升级后的 skill 输出契约和串联方式： [docs/upgrade-contracts.zh-CN.md](docs/upgrade-contracts.zh-CN.md)
- 想看 Claude Code、Codex、Cursor、MCP 接入： [docs/integration-guide.zh-CN.md](docs/integration-guide.zh-CN.md)
- 想先看终端演示： [demo/DEMO_CN.md](demo/DEMO_CN.md)
- 想看版本变化： [CHANGELOG.md](CHANGELOG.md)

## 为什么首页改短了

npm 发布页更适合作为入口页，而不是整本使用手册。
更完整的使用方式、系统阐述和架构说明已经下沉到上面的独立文档。

## 发布说明

包发布细节不再写入随 npm 发布的 README。

## 贡献

欢迎提交 PR。先看 [CONTRIBUTING.md](CONTRIBUTING.md)。

提交 PR 前建议运行：

```bash
npm run quality
npm audit
```

## 许可证

MIT，见 [LICENSE](LICENSE)。
