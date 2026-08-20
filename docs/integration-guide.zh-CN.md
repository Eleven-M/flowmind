# FlowMind 集成指南

FlowMind 可以直接作为 CLI 使用，也可以通过 JSON 包装命令或 MCP Server 接入其他智能体和 IDE。
如果你只是评估项目，先从 CLI 和内置 demo 开始；需要让其他工具调用 FlowMind 时，再接入 MCP。

## 安装

```bash
npm install -g flowmind
flowmind doctor
flowmind demo log-audit
```

临时试用：

```bash
npx flowmind@latest doctor
npx flowmind@latest demo log-audit
```

## CLI

```bash
flowmind skills
flowmind process --skill log-audit "查询 traceId abc123"
flowmind learn --assets
```

部分 skill 需要外部 MCP、provider 凭证或内部适配器。
内置 demo 不需要这些配置。

## Codex

需要稳定 JSON 输出时，使用 `flowmind-codex`：

```bash
flowmind-codex skills
flowmind-codex --skill log-audit "查询 traceId abc123"
flowmind-codex doctor
```

默认状态目录是当前工作区的 `.flowmind-codex/`。
可以通过 `FLOWMIND_CODEX_HOME=/path/to/state` 改路径。

## MCP Server

通用 MCP 配置：

```json
{
  "mcpServers": {
    "flowmind": {
      "command": "flowmind-mcp",
      "args": [],
      "env": {
        "FLOWMIND_HOME": "/absolute/path/to/.flowmind"
      }
    }
  }
}
```

如果 skill 需要 AI provider，优先用环境变量传入，不要把密钥写死到公开配置：

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

## Claude Code

可以一键写入 MCP 配置：

```bash
flowmind install claude
```

也可以手动使用同一个 MCP 命令：

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

修改 MCP 配置后通常需要重启 Claude Code。

## WorkBuddy

WorkBuddy 也可以直接安装同一个 FlowMind MCP 入口：

```bash
flowmind install workbuddy
```

如果希望 WorkBuddy 接入时同时完成 FlowMind 自身的资源、组件、技能和 AI 配置，直接带配置包：

```bash
flowmind install workbuddy \
  --flowmind-home /absolute/path/to/flowmind-home \
  --flowmind-config config/flowmind-config-package.example.md
```

这会同时写入 WorkBuddy MCP 配置，并把 FlowMind 配置导入到 `/absolute/path/to/flowmind-home/.flowmind/`。后续 WorkBuddy 通过 MCP 调用 FlowMind 时会直接使用这些配置，不需要再执行 `flowmind init` 初始化 MCP。

如果 WorkBuddy 使用团队自定义配置路径，显式指定即可：

```bash
flowmind install workbuddy --config /absolute/path/to/workbuddy-mcp.json
```

只预览不写入：

```bash
flowmind install workbuddy --dry-run --json
```

手动配置 WorkBuddy 时，可以参考：

```bash
config/workbuddy-mcp-config.example.json
```

如果还需要初始化 FlowMind 自身的资源、技能和 AI 配置，可以导入配置包示例：

```bash
flowmind config --import config/flowmind-config-package.example.md --dry-run --json
flowmind config --import config/flowmind-config-package.example.md
```

这个配置包会生成或更新 `~/.flowmind/config.json`、`ai-config.json`、`resource-config.json`、`component-config.json` 和 `skill-config.json`。

## Cursor、Windsurf、Cline

这些客户端都可以使用同一个 MCP 命令：

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

不同客户端的配置文件位置不同，但 command 和 args 保持一致。
修改 MCP 配置后通常需要重启客户端。

## 本地状态

FlowMind 把配置、workflow history 和学习数据放在 `FLOWMIND_HOME/.flowmind`。
如果没有设置 `FLOWMIND_HOME`，会使用当前用户主目录。

可能包含凭证或执行上下文的文件会在 POSIX 文件系统上使用私有权限写入。
不要提交 `.flowmind/`、`.flowmind-codex/` 或真实 provider 凭证。

## 排查

```bash
flowmind doctor
flowmind skills
flowmind release-check
flowmind demo log-audit --json
```

如果某个 skill 提示缺少 provider 或 binding，先配置对应 MCP server 或资源绑定。
