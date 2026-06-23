<div align="center">

# FlowMind Demo Script

**Live Demo Guide for Investors & Partners**

</div>

---

## 🎬 Demo Overview

**Duration**: 10-15 minutes
**Audience**: Investors, partners, potential customers
**Goal**: Show FlowMind's learning capability and value proposition

---

## 📋 Demo Setup

### Prerequisites

```bash
# Terminal 1: FlowMind CLI
cd flowmind
npm install
npm link

# Terminal 2: Clean environment
rm -rf ~/.flowmind/learning
flowmind init
```

### Demo Data

Prepare sample files:
- `sample-code.js` - Code with intentional issues
- `sample-logs.txt` - Sample log output
- `sample-api.yaml` - API specification

---

## 🎬 Demo Script

### Part 1: Introduction (2 minutes)

**Say:**
> "Today I'll show you FlowMind - the AI agent that learns how you work.
> Unlike traditional AI tools that forget your preferences, FlowMind learns from your corrections and applies them automatically forever."

**Show:**
- Project overview
- Key features list
- Architecture diagram

---

### Part 2: The Problem (2 minutes)

**Say:**
> "Let me show you the problem FlowMind solves. With traditional AI tools..."

**Demo:**
```bash
# Traditional AI - repeating instructions
You: "查询日志用顺序列表格式"
AI: [Uses tree format]

You: "不对，用顺序列表"
AI: [Uses tree format again]

You: [Frustrated] "我说用顺序列表！"
AI: [Still doesn't remember]
```

**Say:**
> "Developers waste 20-30% of their time repeating the same instructions."

---

### Part 3: FlowMind Learning (3 minutes)

**Say:**
> "Now let me show you how FlowMind solves this."

**Demo:**
```bash
# First time - teach FlowMind
flowmind "查询 traceId abc123 的日志"
FlowMind: [Returns default format]

You: "用顺序列表格式，显示 URL、入参、响应"
FlowMind:
┌─────────────────────────────────────────────────────┐
│ 🧠 Learning Captured                                │
├─────────────────────────────────────────────────────┤
│ Skill: log-audit                                    │
│ Type: output_format                                 │
│ Preference: Sequential list format                  │
└─────────────────────────────────────────────────────┘

# Second time - FlowMind remembers!
flowmind "查询 traceId def456 的日志"
FlowMind: [Uses sequential list automatically]
FlowMind:
┌─────────────────────────────────────────────────────┐
│ ✨ Applying Learned Workflow                        │
├─────────────────────────────────────────────────────┤
│ Based on: Previous learning                         │
│ Using: Sequential list format                       │
└─────────────────────────────────────────────────────┘
```

**Say:**
> "FlowMind learned from my correction and applied it automatically. No more repeating!"

---

### Part 4: Scene Mapping (3 minutes)

**Say:**
> "FlowMind can also learn entire workflows."

**Demo:**
```bash
# Define a workflow
flowmind "排查问题先查错误日志，再查链路，最后查代码"
FlowMind:
┌─────────────────────────────────────────────────────┐
│ 🎯 Scene Mapping Saved                              │
├─────────────────────────────────────────────────────┤
│ Scene: Problem Debugging                            │
│ Workflow:                                           │
│ 1. Error logs first                                 │
│ 2. Then trace analysis                              │
│ 3. Finally code review                              │
└─────────────────────────────────────────────────────┘

# Use the workflow
flowmind "排查线上问题 order-123"
FlowMind: [Follows your workflow automatically]

# Show execution
Step 1/3: 查看错误日志... ✓
Step 2/3: 分析调用链路... ✓
Step 3/3: 审查相关代码... ✓
```

**Say:**
> "FlowMind remembers complex workflows and executes them automatically."

---

### Part 5: Real-World Use Cases (3 minutes)

**Demo 1: Code Review**
```bash
flowmind "审查这个文件的安全漏洞"
FlowMind: [Shows security issues with fixes]
```

**Demo 2: API Sync**
```bash
flowmind "同步接口到 YApi"
FlowMind: [Syncs and shows report]
```

**Demo 3: Data Validation**
```bash
flowmind "验证订单数据的正确性"
FlowMind: [Shows validation report]
```

---

### Part 6: Learning Management (1 minute)

**Demo:**
```bash
# View all learnings
flowmind learn list

# View scene mappings
flowmind scenes list

# Export for team sharing
flowmind learn export team-learnings.json
```

**Say:**
> "Teams can share learnings, so everyone benefits from collective knowledge."

---

### Part 7: Q&A (2 minutes)

**Prepare answers for:**

1. **"How accurate is the learning?"**
   > "95%+ accuracy with our multi-dimensional matching algorithm."

2. **"What about privacy?"**
   > "All data stored locally. Nothing sent to external servers."

3. **"How does it scale?"**
   > "Enterprise version supports team sharing and centralized management."

4. **"What's the business model?"**
   > "Freemium: Free for individuals, paid for teams and enterprises."

---

## 🎯 Key Demo Points

### Highlight These Features

1. **Learning Speed**: One correction = permanent fix
2. **Scene Mapping**: Complex workflows remembered
3. **Privacy**: All local storage
4. **Team Sharing**: Export/import learnings

### Show These Metrics

| Metric | Value |
|--------|-------|
| Time saved | 20-30% on repetitive tasks |
| Learning accuracy | 95%+ |
| User satisfaction | NPS 72+ |

---

## 🛠️ Demo Troubleshooting

### If Learning Doesn't Work

```bash
# Check learning records
flowmind learn list

# Verify configuration
flowmind config --list

# Reset if needed
flowmind learn reset log-audit
```

### If Skills Don't Load

```bash
# List available skills
flowmind skills

# Reload skills
flowmind skills --reload
```

---

## 📊 Demo Follow-up

### After Demo

1. Send one-pager summary
2. Share GitHub repository
3. Offer trial access
4. Schedule follow-up call

### Key Takeaways

- FlowMind learns from corrections
- No more repeating instructions
- Team knowledge sharing
- Privacy-first approach

---

## 🎬 Demo Variations

### Short Demo (5 minutes)

Focus on:
1. Problem statement
2. Learning demo
3. One use case

### Technical Demo (20 minutes)

Add:
1. Architecture deep-dive
2. Custom skill creation
3. API integration
4. Enterprise features

### Investor Demo (10 minutes)

Focus on:
1. Market problem
2. Product demo
3. Business model
4. Traction metrics

---

<div align="center">

**Good luck with your demo! 🚀**

*Remember: The best demo shows the "wow" moment - when FlowMind applies learning automatically.*

</div>
