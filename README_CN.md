<div align="center">

# FlowMind

### 给 Codex、Claude、WorkBuddy 和 MCP 工具使用的可复用工作流层

FlowMind 把常用开发动作沉淀成 skill：加载本地知识、查询日志、审核代码、校验设计规范，并把你的纠正自动学习成下次可复用的偏好。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub source](https://img.shields.io/badge/source-GitHub%20%28primary%29-181717?logo=github)](https://github.com/Eleven-M/flowmind)
[![npm version (frozen)](https://img.shields.io/badge/npm-v2.3.1%20frozen-orange)](https://www.npmjs.com/package/flowmind)
[![npm downloads](https://img.shields.io/npm/dw/flowmind.svg)](https://www.npmjs.com/package/flowmind)

[English](README.md) | [集成指南](docs/integration-guide.zh-CN.md) | [技能目录](docs/skills-catalog.md) | [安全说明](SECURITY.md) | [更新记录](CHANGELOG.md)

> **开发主场：** FlowMind 在 GitHub 开放开发，本仓库是唯一事实来源。npm 上的 `flowmind` 包为冻结快照（v2.3.1），新版本将优先发布在本仓库。

</div>

---

## 安装

从 GitHub 安装（主要渠道，始终最新）：

```bash
git clone https://github.com/Eleven-M/flowmind.git
cd flowmind && npm install && npm run build
./bin/flowmind.js doctor
```

从 npm 安装（冻结快照 v2.3.1）：

```bash
npm install -g flowmind
flowmind doctor
```

不接任何 provider 或 MCP，也可以先看内置演示：

```bash
flowmind demo log-audit
flowmind demo code-review
flowmind skills
```

运行时支持 Node.js 18 及以上版本。

## 一键初始化 FlowMind 配置

用 Markdown 配置包一次生成 AI、资源、组件和 skill 配置：

```bash
flowmind config --import config/flowmind-config-package.example.md --dry-run --json
flowmind config --import config/flowmind-config-package.example.md
```

导入后会生成 FlowMind 运行时读取的配置文件：

```text
~/.flowmind/config.json
~/.flowmind/ai-config.json
~/.flowmind/resource-config.json
~/.flowmind/component-config.json
~/.flowmind/skill-config.json
```

实际使用时复制 [config/flowmind-config-package.example.md](config/flowmind-config-package.example.md)，替换 MCP server 名称、项目 ID、知识库 namespace、AI provider 等信息即可。

## 在模型工具中使用

### Codex

Codex 或脚本需要稳定 JSON 输出时，用：

```bash
flowmind-codex skills
flowmind-codex --skill log-audit "查询 traceId abc123"
flowmind-codex doctor
```

默认情况下，Codex 与 MCP、普通 CLI 共享 `~/.flowmind/` 下的学习和资源状态。
可以通过 `FLOWMIND_SHARED_HOME=/path/to/home` 指定共享目录；只有需要隔离 Codex 数据时才设置
`FLOWMIND_CODEX_HOME=/path/to/state`。

### Claude

一键把 FlowMind 安装成 Claude MCP server：

```bash
flowmind install claude
```

安装 Claude 入口时，同时初始化 FlowMind 配置：

```bash
flowmind install claude \
  --flowmind-home /absolute/path/to/flowmind-home \
  --flowmind-config config/flowmind-config-package.example.md
```

修改 MCP 配置后重启 Claude。

### WorkBuddy

一键把 FlowMind 安装成 WorkBuddy MCP server：

```bash
flowmind install workbuddy
```

安装 WorkBuddy 入口时，同时初始化 FlowMind 配置：

```bash
flowmind install workbuddy \
  --flowmind-home /absolute/path/to/flowmind-home \
  --flowmind-config config/flowmind-config-package.example.md
```

如果 WorkBuddy 使用团队自定义 MCP 配置路径：

```bash
flowmind install workbuddy --config /absolute/path/to/workbuddy-mcp.json
```

手动配置可参考：[config/workbuddy-mcp-config.example.json](config/workbuddy-mcp-config.example.json)。

## 常用工作流

| 目标 | 命令 |
| --- | --- |
| 加载和查看本地知识、已学习资产 | `flowmind learn --assets --json` |
| 查询日志和 trace 链路 | `flowmind process --skill log-audit "查询 traceId abc123"` |
| 按固定规则审核代码 | `flowmind process --skill code-review "review the staged changes"` |
| 本地分析设计规范和代码流程 | `flowmind analyze "总结本地设计和代码流程" --offline` |
| 校验数据逻辑 | `flowmind process --skill data-logic-validation "检查订单数据一致性"` |
| 执行受保护工作流 | `flowmind workflow --chain follow-up-chain.json` |
| 查看 Skill / 组件 / 资源 / 契约清单 | `flowmind ontology inventory --json` |
| 校验本体资产清单 | `flowmind ontology validate` |
| 带 Ontology 健康检查 | `flowmind doctor --ontology` |

FlowMind 的 demo 和本地确定性分析不依赖 AI provider。真实日志、数据库、文档、部署等 skill 需要配置对应 MCP 资源或 adapter。

## 决策 Provider 路由

FlowMind 2.3.1 新增面向 skill 选择的决策 provider 路由。`jev` 这类决策 provider 只回答类型化选择题，不会接管 chat 或 completion 调用；只有显式启用并提供凭证后才会生效：

```json
{
  "ai": {
    "providers": {
      "jev": {
        "enabled": true,
        "apiKey": "${JEV_API_KEY}",
        "model": "jev-latest"
      }
    },
    "featureProviders": {
      "skillSelection": "jev"
    }
  }
}
```

当决策 provider 未启用、调用失败或置信度过低时，FlowMind 会自动回退到默认 LLM provider。详情见 [provider 适配指南](docs/provider-adapter-guide.md)。

## 自动学习

FlowMind 会把你的显式纠正保存为本地可复用状态：

```bash
flowmind process --skill log-audit "查询 traceId abc123"
flowmind "下次用表格格式"
```

下次相似请求会复用这个偏好。显式选择 skill 也会被学习：

```bash
flowmind process --skill offline-design-analysis "分析合同额度校验流程"
```

之后相似的分析请求会优先走已学习的路由。

## 本地状态

FlowMind 的本地状态路径：

```text
FLOWMIND_HOME/.flowmind
```

如果没有设置 `FLOWMIND_HOME`，则使用当前用户主目录。可能包含凭证或 workflow 状态的文件会在 POSIX 系统上使用私有权限写入。

## 更多文档

- 完整集成指南：[docs/integration-guide.zh-CN.md](docs/integration-guide.zh-CN.md)
- Skill 能力矩阵：[docs/skills-catalog.md](docs/skills-catalog.md)
- Provider 适配指南：[docs/provider-adapter-guide.md](docs/provider-adapter-guide.md)
- Ontology P0 与后续路线：[docs/ontology-optimization.md](docs/ontology-optimization.md)
- 安全模型：[docs/security-model.md](docs/security-model.md)
- 版本记录：[CHANGELOG.md](CHANGELOG.md)

## 许可证

MIT，见 [LICENSE](LICENSE)。
