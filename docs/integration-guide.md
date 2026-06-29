# FlowMind 集成指南

## 把 FlowMind 作为 Agent/Skill 安装到 AI CLI 工具

---

## 目录

- [Claude Code 集成](#claude-code-集成)
- [Cursor 集成](#cursor-集成)
- [Windsurf 集成](#windsurf-集成)
- [Cline 集成](#cline-集成)
- [Codex 集成](#codex-集成)
- [通用 MCP 客户端](#通用-mcp-客户端)

---

## Claude Code 集成

### 方式 1：作为 MCP Server（推荐）

这是最完整的集成方式，让 Claude Code 可以直接调用 FlowMind 的所有技能。

#### 步骤 1：安装 FlowMind

```bash
npm install -g flowmind
```

#### 步骤 2：配置 MCP Server

在项目根目录创建或编辑 `.claude/settings.local.json`：

```json
{
  "mcpServers": {
    "flowmind": {
      "command": "flowmind-mcp",
      "args": [],
      "env": {
        "OPENAI_API_KEY": "${OPENAI_API_KEY}"
      }
    }
  }
}
```

#### 步骤 3：重启 Claude Code

配置完成后，重启 Claude Code 即可生效。

#### 步骤 4：使用

在 Claude Code 中直接使用自然语言：

```
你：帮我查询最近1小时的错误日志
Claude：我来调用 FlowMind 帮你查询...

你：审查一下这个项目的代码质量
Claude：我来使用 FlowMind 的代码审查技能...
```

### 方式 2：作为 Slash Command（技能）

把 FlowMind 的技能注册为 Claude Code 的 Slash Command。

#### 步骤 1：创建技能目录

```bash
mkdir -p ~/.claude/skills
```

#### 步骤 2：创建 FlowMind 技能文件

创建 `~/.claude/skills/flowmind.md`：

```markdown
---
name: flowmind
description: FlowMind - AI Agent for development workflows
---

# FlowMind Agent

FlowMind is an intelligent development workflow automation agent.

## Available Skills

### Log Audit
- Trigger: "日志", "traceId", "排查"
- Usage: `flowmind "查询 traceId abc123 的日志"`

### Code Review
- Trigger: "代码审查", "review", "PR"
- Usage: `flowmind "审查代码质量"`

### Data Validation
- Trigger: "数据验证", "逻辑检查"
- Usage: `flowmind "验证订单数据"`

## How to Use

When the user asks about:
1. Log analysis or debugging → Use flowmind log-audit skill
2. Code review or quality check → Use flowmind code-review skill
3. Data validation → Use flowmind data-validation skill
4. API documentation → Use flowmind api-sync skill

Execute: `flowmind "user's request"`
```

#### 步骤 3：使用

在 Claude Code 中输入 `/flowmind` 即可调用。

### 方式 3：作为 Tool（工具）

在 Claude Code 的 `settings.json` 中注册 FlowMind 为自定义工具。

```json
{
  "tools": {
    "flowmind": {
      "command": "flowmind",
      "args": ["process", "--json", "{{input}}"],
      "description": "FlowMind AI Agent for development workflows"
    }
  }
}
```

---

## Cursor 集成

Cursor 支持 MCP 协议，可以像 Claude Code 一样集成 FlowMind。

### 步骤 1：配置 MCP Server

在 Cursor 的设置中，找到 MCP Server 配置，添加：

```json
{
  "flowmind": {
    "command": "flowmind-mcp",
    "args": []
  }
}
```

### 步骤 2：使用

在 Cursor 的 AI 对话中直接使用：

```
@flowmind 查询最近1小时的错误日志
@flowmind 审查代码质量
```

---

## Windsurf 集成

Windsurf 是 Codeium 的 AI IDE，支持 MCP 协议。

### 步骤 1：配置 MCP Server

在 Windsurf 的设置中，找到 MCP 配置，添加：

```json
{
  "mcpServers": {
    "flowmind": {
      "command": "flowmind-mcp",
      "args": []
    }
  }
}
```

### 步骤 2：使用

在 Windsurf 的 AI 聊天中使用 FlowMind。

---

## Cline 集成

Cline 是 VS Code 的 AI 编程助手，支持 MCP 协议。

### 步骤 1：安装 Cline

在 VS Code 中安装 Cline 扩展。

### 步骤 2：配置 MCP Server

在 Cline 的设置中，找到 MCP Servers 配置，添加：

```json
{
  "flowmind": {
    "command": "flowmind-mcp",
    "args": []
  }
}
```

### 步骤 3：使用

在 Cline 的聊天中直接使用 FlowMind。

---

## Codex 集成

Codex 是 OpenAI 的 CLI 工具，通过 JSON 输出集成 FlowMind。

### 方式 1：使用 `flowmind-codex`（推荐）

安装后直接使用专门的 Codex 包装命令：

```bash
# 处理请求
flowmind-codex "查询最近1小时的错误日志"

# 强制指定技能
flowmind-codex --skill log-audit "查询 traceId abc123 的完整链路"

# 列出技能
flowmind-codex skills

# 查看单个技能
flowmind-codex skill log-audit

# 健康检查
flowmind-codex doctor
```

这个命令固定输出 JSON，适合 Codex、脚本和 CI 直接消费。
默认会把配置、缓存和学习数据写到当前工作区的 `.flowmind-codex/`。
如需改路径，可设置 `FLOWMIND_CODEX_HOME=/your/path`。

### 方式 2：直接调用 `flowmind --json`

```bash
# 获取技能列表
flowmind skills --json

# 执行任务
flowmind process --json "查询日志"
```

### 方式 3：创建 Wrapper 脚本

创建 `flowmind-codex.sh`：

```bash
#!/bin/bash
# FlowMind Codex Integration Wrapper

INPUT="$1"
RESULT=$(flowmind process --json "$INPUT")

# 提取结果
echo "$RESULT" | jq -r '.data // .message // .error'
```

### 方式 4：Python 集成

```python
import subprocess
import json

class FlowMindAgent:
    def __init__(self):
        self.name = "flowmind"

    def run(self, query: str) -> dict:
        result = subprocess.run(
            ['flowmind', 'process', '--json', query],
            capture_output=True,
            text=True
        )
        return json.loads(result.stdout)

    def list_skills(self) -> list:
        result = subprocess.run(
            ['flowmind', 'skills', '--json'],
            capture_output=True,
            text=True
        )
        return json.loads(result.stdout)['skills']

# 使用
agent = FlowMindAgent()
result = agent.run("查询 traceId abc123 的日志")
print(result)
```

---

## 通用 MCP 客户端

任何支持 MCP 协议的客户端都可以集成 FlowMind。

### MCP Server 配置

```json
{
  "name": "flowmind",
  "transport": {
    "type": "stdio",
    "command": "flowmind-mcp",
    "args": []
  }
}
```

### MCP 工具列表

| 工具名称 | 描述 | 参数 |
|---------|------|------|
| `flowmind_process` | 处理请求 | `{input: string, context?: object}` |
| `flowmind_list_skills` | 列出技能 | `{}` |
| `flowmind_get_skill` | 技能详情 | `{name: string}` |
| `flowmind_ai_status` | AI 状态 | `{}` |
| `flowmind_learning_stats` | 学习统计 | `{}` |
| `flowmind_skill_<name>` | 执行技能 | `{input: string, context?: object}` |

---

## 集成架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    AI CLI 工具                               │
│         (Claude Code / Cursor / Windsurf / Cline)           │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            │ MCP Protocol
                            │
┌───────────────────────────v─────────────────────────────────┐
│                    FlowMind MCP Server                       │
│                      (mcp/server.js)                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Intent      │  │ Skill       │  │ Learning    │         │
│  │ Understanding│  │ Selection   │  │ Engine      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │              FlowMind Skills                          │   │
│  │  log-audit │ code-review │ data-validation │ ...      │   │
│  └─────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐   │
│  │              External Services (MCP)                  │   │
│  │  SLS │ DMS │ Redis │ YApi │ Yuque │ Friday │ ...     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 常见问题

### Q1: Claude Code 无法识别 FlowMind MCP Server？

1. 检查 `.claude/settings.local.json` 配置是否正确
2. 确认 `flowmind-mcp` 命令可用：`which flowmind-mcp`
3. 重启 Claude Code

### Q2: 如何让 FlowMind 在所有项目中可用？

在用户级别配置 MCP Server：

```bash
# 编辑全局配置
vim ~/.claude/settings.json
```

添加：
```json
{
  "mcpServers": {
    "flowmind": {
      "command": "flowmind-mcp",
      "args": []
    }
  }
}
```

### Q3: 如何同时使用多个 AI CLI 工具？

FlowMind 支持同时被多个客户端调用，学习数据会自动同步。

### Q4: 如何自定义 FlowMind 技能？

1. 在 `skills/` 目录创建新技能
2. 创建 `SKILL.md` 定义触发词
3. 创建 `index.js` 实现逻辑
4. 重启 MCP Server

---

## 快速开始

```bash
# 1. 安装 FlowMind
npm install -g flowmind

# 2. 初始化
flowmind init --ai openai

# 3. 配置 Claude Code
echo '{"mcpServers":{"flowmind":{"command":"flowmind-mcp"}}}' > .claude/settings.local.json

# 4. 重启 Claude Code

# 5. 使用
# 在 Claude Code 中直接说：帮我查询日志
```
