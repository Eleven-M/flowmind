<![CDATA[---
name: requirement-analyst
description: Requirement analyst skill for FlowMind. Six-dimensional analysis: historical design principles, iteration rationale, extensibility, market roadmap, requirement-code deviation, and upgrade vulnerabilities.
metadata:
  version: "1.0.0"
  author: flowmind
  category: analysis
---

# Requirement Analyst Skill

Comprehensive requirement analysis combining code reality with requirement intent. Acts as a senior requirement analyst (需求分析师) evaluating from six dimensions.

## Features

### Historical Design Principle Evaluation
- Evaluate why historical designs were made
- Assess design validity in current context
- Identify design debt and knowledge gaps

### Iteration Rationale Assessment
- Analyze iteration driving forces
- Evaluate iteration quality and pace
- Identify anomalous iterations (rollback, rework, over-design)

### Extensibility Assessment
- Development extensibility (modularity, interfaces, configurability)
- Requirement upgrade extensibility (data model, API compatibility)
- User growth extensibility (performance, caching, horizontal scaling)

### Market Roadmap Planning
- Feature coverage analysis
- Requirement trend analysis
- Short/mid/long-term development roadmap

### Requirement-Code Deviation Analysis
- Feature gaps (required but not implemented)
- Over-implementation (implemented but not required)
- Understanding gaps (implementation doesn't match intent)
- Documentation lag (code changed, docs not updated)

### Upgrade Vulnerability Identification
- Data model fragility
- API incompatibility risks
- Hardcoded traps
- Test blind spots
- Dependency coupling

## Trigger Patterns

```
"需求分析", "需求评审", "需求评估"
"设计评审", "设计评估", "设计原理分析"
"迭代评估", "迭代分析", "迭代回顾"
"扩展性评估", "扩展性分析", "架构评估"
"市场规划", "产品规划", "发展路线"
"需求偏差", "需求偏差分析", "代码与需求对比"
"升级风险", "升级漏洞", "技术债务评估"
"全面分析", "需求分析师"
"requirement analysis", "design review"
"iteration review", "extensibility assessment"
"market roadmap", "requirement deviation"
"upgrade risk", "technical debt"
```

## Output Format

### Comprehensive Report

```
┌─────────────────────────────────────────────────────┐
│ Requirement Analysis Report                         │
├─────────────────────────────────────────────────────┤
│ Project: {project_name}                             │
│ Analysis Scope: {dimensions}                        │
│ Overall Score: {score}/100                          │
├─────────────────────────────────────────────────────┤
│ Dimension Scores:                                   │
│ • Historical Design:  {score}/100                   │
│ • Iteration Rationale: {score}/100                  │
│ • Extensibility:       {score}/100                  │
│ • Market Roadmap:      {score}/100                  │
│ • Req-Code Deviation:  {score}/100                  │
│ • Upgrade Vulnerability: {score}/100                │
├─────────────────────────────────────────────────────┤
│ Key Findings:                                       │
│ • {finding_1}                                       │
│ • {finding_2}                                       │
├─────────────────────────────────────────────────────┤
│ Priority Actions:                                   │
│ P0: {action_1}                                      │
│ P1: {action_2}                                      │
│ P2: {action_3}                                      │
└─────────────────────────────────────────────────────┘
```

### Single Dimension Report

```
┌─────────────────────────────────────────────────────┐
│ {Dimension} Assessment Report                       │
├─────────────────────────────────────────────────────┤
│ Score: {score}/100                                  │
│ Status: {status}                                    │
├─────────────────────────────────────────────────────┤
│ Findings:                                           │
│ 1. {finding} - {severity}                           │
│ 2. {finding} - {severity}                           │
├─────────────────────────────────────────────────────┤
│ Recommendations:                                    │
│ • {recommendation}                                  │
└─────────────────────────────────────────────────────┘
```

## Analysis Dimensions Detail

### Dimension 1: Historical Design Principles

| Item | Description |
|------|-------------|
| Design Intent | What problem was the design solving? |
| Design Basis | What data/assumptions/constraints was it based on? |
| Current Validity | Is the design still valid today? |
| Design Debt | Which decisions have become technical debt? |
| Knowledge Transfer | Is design knowledge effectively preserved? |

### Dimension 2: Iteration Rationale

| Item | Description |
|------|-------------|
| Driving Force | Demand-driven, tech-driven, or market-driven? |
| Evolution Path | Is the iteration path logical? |
| Iteration Quality | Clean implementation or leftover debt? |
| Iteration Pace | Is the frequency reasonable? |
| Anomalous Iterations | Rollbacks, reworks, over-design? |

### Dimension 3: Extensibility

| Category | Assessment Items |
|----------|-----------------|
| Development | Modularity, interface abstraction, configurability, readability, test coverage |
| Requirement Upgrade | Data model extensibility, API compatibility, business rule flexibility, state machine extension |
| User Growth | Performance bottlenecks, data volume capacity, caching strategy, horizontal scaling, degradation |

### Dimension 4: Market Roadmap

| Item | Description |
|------|-------------|
| Feature Coverage | What's covered vs. uncovered? |
| Requirement Trends | Historical trends and predictions |
| Technology Trends | Current stack evolution direction |
| Competitive Positioning | Gaps vs. industry standards |
| Short-term (1-3mo) | Immediate action items |
| Mid-term (3-6mo) | Strategic initiatives |
| Long-term (6-12mo) | Vision and goals |

### Dimension 5: Requirement-Code Deviation

| Deviation Type | Description |
|----------------|-------------|
| Feature Gap | Required but not implemented |
| Over-implementation | Implemented but not required |
| Understanding Gap | Implementation doesn't match intent |
| Technical Compromise | Requirement degraded due to tech limits |
| Requirement Creep | Requirement silently expanded |
| Requirement Shrink | Requirement silently reduced |
| Documentation Lag | Code changed, docs not updated |

### Dimension 6: Upgrade Vulnerability

| Vulnerability Type | Description |
|--------------------|-------------|
| Data Model Fragility | Schema changes may cause migration issues |
| API Incompatibility | Interface changes may break clients |
| Hardcoded Traps | Hardcoded rules need code changes to modify |
| State Machine Deadlock | State transitions may create illegal states |
| Performance Bottleneck | Feature upgrades amplify existing perf issues |
| Test Blind Spots | Untested modules have highest upgrade risk |
| Dependency Coupling | Tight coupling causes cascade changes |

## Learning Integration

This skill supports FlowMind learning:

- **Analysis Focus**: Learns which dimensions you care about most
- **Severity Threshold**: Learns your risk tolerance
- **Report Format**: Learns preferred report detail level

## Examples

### Example 1: Full Requirement Analysis

```
User: 对当前项目做一次全面需求分析

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Requirement Analysis Report                         │
├─────────────────────────────────────────────────────┤
│ Project: order-service                              │
│ Analysis Scope: All 6 dimensions                    │
│ Overall Score: 72/100                               │
├─────────────────────────────────────────────────────┤
│ Dimension Scores:                                   │
│ • Historical Design:  75/100                        │
│ • Iteration Rationale: 80/100                       │
│ • Extensibility:       65/100                       │
│ • Market Roadmap:      70/100                       │
│ • Req-Code Deviation:  68/100                       │
│ • Upgrade Vulnerability: 62/100                     │
├─────────────────────────────────────────────────────┤
│ Key Findings:                                       │
│ • Order state machine lacks extensibility           │
│ • 3 features have requirement-code deviation        │
│ • Redis caching strategy needs redesign for scale   │
├─────────────────────────────────────────────────────┤
│ P0: Fix state machine deadlocks in refund flow      │
│ P1: Align 3 deviated features with requirements     │
│ P2: Redesign Redis caching for 10x user growth      │
└─────────────────────────────────────────────────────┘
```

### Example 2: Upgrade Risk Assessment

```
User: 评估一下需求升级的风险

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Upgrade Vulnerability Report                        │
├─────────────────────────────────────────────────────┤
│ Vulnerabilities Found: 8                            │
│ • HIGH: 2                                           │
│ • MEDIUM: 3                                         │
│ • LOW: 3                                            │
├─────────────────────────────────────────────────────┤
│ 🔴 HIGH: Order status enum hardcoded (OrderService) │
│    Impact: All order operations                     │
│    Fix: Extract to configuration                    │
│                                                    │
│ 🔴 HIGH: No index on order_items.product_id         │
│    Impact: Query performance at scale               │
│    Fix: Add composite index                         │
│                                                    │
│ 🟡 MEDIUM: Payment API v1 deprecated                │
│    Impact: Payment processing                       │
│    Fix: Migrate to v2 API                           │
└─────────────────────────────────────────────────────┘
```

## Configuration

```json
{
  "requirement-analyst": {
    "dimensions": {
      "historicalDesign": true,
      "iterationRationale": true,
      "extensibility": true,
      "marketRoadmap": true,
      "reqCodeDeviation": true,
      "upgradeVulnerability": true
    },
    "scoringWeights": {
      "historicalDesign": 0.15,
      "iterationRationale": 0.15,
      "extensibility": 0.20,
      "marketRoadmap": 0.15,
      "reqCodeDeviation": 0.15,
      "upgradeVulnerability": 0.20
    },
    "reportFormat": "detailed"
  }
}
```
]]>