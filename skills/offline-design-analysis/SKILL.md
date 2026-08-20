---
name: offline-design-analysis
description: Analyze local learning history, Markdown/HTML/Lake/Lakebook documents, and repository code without an AI model. Use for natural-language requests to summarize code or documents, recover historical design rules, explain a module, or generate an evidence-backed design/business flow when AI is unavailable or offline execution is requested.
---

# Offline Design Analysis

Analyze only local material with FlowMind's deterministic parser and ranker. Do not call a model or network service.

## Workflow

1. Resolve the synchronized FlowMind source directory and requested repository directory.
2. Parse bounded supported files and sanitized learning records.
3. Rank evidence using natural-language terms and `RESOURCE_INDEX.md` metadata.
4. Extract headings, explicit rules, ordered steps, code symbols, endpoints, data/cache keys, and message names.
5. Return the design flow, summaries, citations, confidence, limitations, and test focus.

## Evidence rules

- Preserve the local relative path for every conclusion.
- Report low confidence when evidence is sparse or the requested relationship is not explicit.
- Treat generated flow as a discovery aid, not proof of unstated business semantics.
- Never execute analyzed code or include credential values.

## Trigger Patterns

```text
"离线分析", "无模型分析", "不用AI分析", "没有AI模型"
"分析历史资料", "分析学习资料", "历史设计总结"
"总结代码", "代码总结", "分析文档", "文档总结"
"生成设计流程", "梳理设计流程", "本地资料分析"
"分析流程", "业务流程分析", "分析业务逻辑", "梳理调用链路"
"offline analysis", "without AI", "summarize local code"
```

## Examples

```text
离线分析历史资料和代码，总结门店搜索的设计流程
没有 AI 模型，帮我分析 sourceDir=/data/source repo=/work/service 的合同续约逻辑
总结本地文档中的业务规则并给出证据来源
分析下当前合同校验额度的流程
```
