---
name: release-inspection
description: "上线巡检：对灰度/发布需求做同环境、同条件比对验证，产出分层评估报告，并按需求级机器人配置推送钉钉。"
metadata:
  version: "0.1.0"
  author: flowmind
  category: release
---

# Release Inspection Skill (上线巡检)

对需求的灰度/上线结果做巡检：采集证据 → 按比对原则分析 → 生成分层评估报告 →
经 dingtalk-notify 按需求级机器人配置推送。

## 巡检比对原则（必须遵守）

1. **同环境比对，同词（或同条件）比对**
   - 指标比对必须在**同一个环境内**进行（灰度 vs 灰度、线上 vs 线上），且使用同一个关键词或同一组查询条件。
   - **禁止跨环境比对作为指标**（如 线上 vs 灰度、UAT vs 生产）：不同环境的服务配置（Pod 副本数、资源限额、缓存、数据量、流量）不一致，差值混杂环境差异，不能归因于代码变更。
   - 跨环境数据只能作为背景参考，输出时必须标注「跨环境，仅供参考，不作为指标」，且不得写入性能结论的指标行。
   - 合法对照示例（均在同环境内、同词/同条件）：
     - 同环境发布前后对照：同词耗时在时间维度上的前后对比
     - 同环境冷查 vs 热查：缓存未命中 vs 命中
     - 同环境同时刻并发对照：不同用户同一时刻查同词（排除用户身份因素）
     - 灰度内新旧逻辑命中对照：同请求内命中新逻辑 vs 未命中新逻辑的分段耗时

（后续比对原则按编号继续追加在本节。）

## Workflow

1. **输入**：需求 ID（可选：环境、时间窗、关注接口/关键词）。
2. **采集**：按下节「联动数据源」三路并行采集 —— SLS 日志、代码 review、历史资源评估。
3. **分析**：按上方比对原则构造对照；跨环境差值一律降级为参考，不进入指标行。
   无法构造同环境对照时，结论必须写「需补数复核」而不是给出劣化/优化百分比。
4. **报告**：使用 dingtalk-notify 的评估报告模版（结论先行、五段式、A/B 明细最多
   展开 5 条其余折叠），三路证据落到对应段落（见下节映射）。
5. **推送**：查 `<workspace>/source/dingtalk-report-config.json` 解析该需求的机器人
   （关键词校验、contentHash 去重、发送后回写 sendHistory），由 dingtalk-notify 发送。

## 联动数据源

巡检报告必须三路联动采集，缺一路时在报告对应段落标注「未联动 + 原因」，不得留空。

| 数据源 | 获取方式 | 落到报告哪一段 |
| --- | --- | --- |
| SLS 日志 | `sls-logs` MCP（queryLogs）或 `sls-log-audit` 技能；网关 Logbook `Incoming Request`/`Outgoing Response` Duration（corrId 关联端到端耗时）；auto-flow 部署清单确认灰度生效范围与时间点 | 采集质量、性能结论（指标行） |
| 代码 review | auto-flow `getDeployChecklistsByDemandId` 拿需求关联流水线/仓库 → `source/project-git-map.json` 定位 git 仓库与分支 → `code-review` / `change-impact-review` 技能审变更 diff | 需求完整度（需求-代码一致性）；review 发现的风险进异常点 |
| 历史资源评估 | `source/RESOURCE_INDEX.md` 按需求 domains/modules/tags 检索相关设计文档（.lake）；`source/reports/` 历史评估报告、`source/verified/` 已验证结论作为历史基线 | 异常点/建议（历史基线对照）；结论引用需注明来源与环境 |

历史基线使用约束：历史报告中的耗时数据必须与其采集环境一致才可作为对照基线，
并遵守比对原则 1（同环境、同词）；跨环境/跨时期历史数据只作背景参考。

## Trigger Patterns

种子触发词（仅初始集合，实际触发以本地学习为准）：

```
"上线巡检", "发布巡检", "灰度巡检", "巡检比对", "巡检报告", "release inspection"
```

### 关键词触发本地化学习

- 生效触发词存于 `~/.flowmind/learning/scenes.json` 的 `scene-release-inspection`
  （keywords + patterns → 路由到本技能），不在 SKILL.md 里维护。
- **学习闭环**：用户用新说法成功触发巡检后，把该说法原样追加进该 scene 的
  `keywords`（去重）；发现某触发词误路由（本意不是巡检）时移除，并在
  `~/.flowmind/learning/records/release-inspection/` 记录原因。
- 学习记录：`records/release-inspection/2026-08-20-001.json`
  （scene_mapping 类型），绑定摘要见 `skill-bindings.json` 的
  `release-inspection` 条目。

## Notes

- 巡检报告的结论必须区分：同环境指标结论 vs 跨环境背景参考。
- 推送去重、关键词校验规则见 dingtalk-notify SKILL.md 的 Demand-level robot config 一节。
