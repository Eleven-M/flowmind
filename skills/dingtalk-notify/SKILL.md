---
name: dingtalk-notify
description: "Push layered evaluation reports and notifications to a DingTalk group robot via webhook URL or configured group names, with optional demand-id enrichment and Markdown log tables."
metadata:
  version: "1.0.0"
  author: flowmind
  category: reporting
---

# Dingtalk Notify Skill

Push markdown reports to a DingTalk group robot (自定义机器人).

## Evaluation report template

For requirement, code, performance, log, or release evaluations, the report body
must be optimized for DingTalk/chat card reading. Put the decision first, keep
sections short, and avoid dumping full comparison tables into the group.

```markdown
**结论**: {一句话结论，可灰度上线/暂缓上线/需补数复核}。**状态**: {通过/关注/阻断}
- **需求编号**: {demandId}
- **时间**: {YYYY-MM-DD HH:mm:ss}
- **采集时间**: {time range}
- **样本量**: {sample size}

### 1. 需求完整度
- {范围是否覆盖}
- {需求-代码一致性}
- {已知遗漏或无需覆盖项}

### 2. 采集质量
- {数据来源、采集窗口、样本量}
- {剔除规则、冷查/缓存/时序影响}
- {统计可信度}

### 3. 性能结论
- {总体性能判断}
- **字段**: 关键词 ｜ B耗时(ms) ｜ A耗时(ms) ｜ 差值(ms)
- {key-1} ｜ B {b ms} ｜ A {a ms} ｜ **↑ +{delta} ms**
- {key-2} ｜ B {b ms} ｜ A {a ms} ｜ **↓ -{delta} ms**
- **A/B汇总**: 共 {n} 条，↑ {up}，↓ {down}，持平 {flat}，未知 {unknown}
- 其余 {hidden} 条已折叠为汇总，不在群消息展开。

### 4. 异常点
- {异常差值、口径偏差、数据缺口或阻断风险}

### 5. 建议/下一步
- {上线范围、观察指标、复核动作、负责人或触发条件}
```

Rules:

- Keep the conclusion/status as the first line. It must explicitly say `可灰度上线`,
  `可全量上线`, `暂缓上线`, or `需补数复核`.
- Keep the five headings and their order: 需求完整度, 采集质量, 性能结论, 异常点,
  建议/下一步.
- Preserve required metadata: demand id, time, sample size, and collection window
  when they are known.
- Keep each bullet to one short point. Avoid long paragraphs and very long
  single lines.
- When log data exists, show only the most important 3-5 A/B examples. Fold the
  remaining rows into a statistical summary.
- Render comparable records as DingTalk-compatible bullet rows with `｜`
  separators. Do not use GFM `|...|` tables or fenced code blocks because clients
  may render them as raw text.
- Use consistent field names and units: `B耗时(ms)`, `A耗时(ms)`, `差值(ms)`,
  `样本量`, `采集时间`.
- A/B 指标行（B耗时/A耗时/差值）必须来自**同环境、同词（或同条件）**比对；
  跨环境差值（如 线上 vs 灰度，环境服务配置不同）只能作为背景参考并明确标注
  「跨环境，仅供参考」，不得写入性能结论的指标行。详见 release-inspection
  SKILL.md 的巡检比对原则。
- Highlight abnormal differences with `↑/↓` and `+/-`, for example
  `**↑ +320 ms**` or `**↓ -180 ms**`.
- Separate evidence from inference. State sample size, exclusions, and uncertainty instead of presenting a small sample as a definitive result.
- Do not include local-machine test environment noise in the final push unless the user explicitly asks for it. Report only release-relevant verification status.
- Use the demand number as the message title, for example `需求 3564 评估报告`; never use a product/framework title such as `FlowMind 报告`.
- Always send the `markdown` payload type. Do not downgrade evaluation reports to DingTalk `text`; the body must retain Markdown headings, bold labels, line breaks, and field tables.
- Preserve line breaks in the report body. Never normalize all whitespace with `\s` because that removes newlines required by DingTalk Markdown.

The JavaScript helper `buildLayeredEvaluationReport` in this skill implements
the same structure for callers that have structured section data.

## Usage

The skill extracts three things from the input:

1. **Webhook URL** - a raw DingTalk robot URL (`https://oapi.dingtalk.com/robot/send?access_token=...`),
   or a configured group name (see Configuration below).
2. **Demand id** (需求编号, optional) - used to enrich the message header. When the workflow
   MCP adapter is available, the demand summary is looked up best-effort and failures degrade
   silently (the message still goes out with the raw demand id).
3. **Content** - the remaining text becomes the report body (markdown).

Example inputs:

- `推送钉钉 https://oapi.dingtalk.com/robot/send?access_token=xxxx 需求编号 REQ-2026-001 测试报告: 全量用例 120 通过 118 失败 2`
- `把测试报告发到测试群 需求ID D202600123` (requires group config)

## Trigger Patterns

```
"推送钉钉", "钉钉推送", "发到钉钉群", "钉钉机器人", "推送报告到钉钉", "dingtalk notify"
```

## Configuration

Named groups avoid pasting raw webhook URLs every time
(`skillConfig.skills.dingtalk-notify` in the flowmind config):

```json
{
  "skillConfig": {
    "skills": {
      "dingtalk-notify": {
        "groups": {
          "测试群": { "webhook": "https://oapi.dingtalk.com/robot/send?access_token=xxx", "secret": "SECxxx" }
        }
      }
    }
  }
}
```

If the robot uses 加签 (signature) security mode, pass the secret inline
(`SEC...` in the input) or set it on the group entry.

## Demand-level robot config (需求级机器人配置)

Evaluation report pushes are owned by the 上线巡检 (release inspection) flow:
when inspection finishes, it resolves the demand's robot from the local config
below instead of pasting raw webhook URLs. Every demand may use a different
robot.

Config file: `<workspace>/source/dingtalk-report-config.json` (gitignored, holds
webhook credentials — never commit it or write it into learning records).

```json
{
  "demands": {
    "3564": {
      "demandName": "3564-闪购-🔼闪购搜索召回逻辑 AND 改 OR",
      "triggerSource": "上线巡检",
      "reportFile": "source/reports/....md",
      "robots": [
        { "name": "3564-评估报告群", "webhook": "https://oapi.dingtalk.com/robot/send?access_token=...", "keyword": "报告", "secret": null }
      ],
      "sendHistory": [
        { "time": "...", "robot": "...", "trigger": "...", "contentHash": "...", "status": "sent" }
      ]
    }
  }
}
```

Before sending for a demand present in this config, the skill MUST:

1. **Resolve robot by demand id**: use the configured `robots[].webhook` /
   `secret`; do not ask the user to paste the URL again, and never reuse one
   demand's robot for another demand.
2. **Keyword check**: the message title or body must contain the robot's
   `keyword` (e.g. `报告`), otherwise DingTalk rejects with errcode 310000.
   Append the keyword to the title if the body lacks it.
3. **Dedup**: compute a content hash of the final markdown. If
   `sendHistory` already has an entry with the same robot + `contentHash` and
   `status: sent`, skip the send unless the input explicitly says
   `重发`/`强制重发`. This prevents duplicate pushes of an unchanged report.
4. **Record history**: after a successful send, append a new entry to
   `sendHistory` (time, robot, trigger source, title, contentHash, status).
   Never overwrite previous entries.

## Notes

- Webhook access tokens are credentials: they are masked in results and must never
  be stored in learning records.
- DingTalk robots are rate limited (about 20 messages per minute); avoid sending in loops.
- Oversized report bodies are truncated to keep the message within DingTalk limits.
