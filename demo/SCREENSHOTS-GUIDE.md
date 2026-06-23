<div align="center">

# FlowMind Screenshots & Visual Guide

**Visual Assets for Marketing & Pitch Deck**

</div>

---

## 📸 Required Screenshots

### 1. Hero Image - Terminal Demo

**Scene**: FlowMind learning in action

```
┌─────────────────────────────────────────────────────────────┐
│ $ flowmind "查询日志用顺序列表格式"                            │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐     │
│ │ 🧠 Learning Captured                                │     │
│ ├─────────────────────────────────────────────────────┤     │
│ │ Skill: log-audit                                    │     │
│ │ Type: output_format                                 │     │
│ │ Preference: Sequential list format                  │     │
│ └─────────────────────────────────────────────────────┘     │
│                                                             │
│ $ flowmind "查询 traceId abc123 的日志"                      │
│                                                             │
│ ┌─────────────────────────────────────────────────────┐     │
│ │ ✨ Applying Learned Workflow                        │     │
│ ├─────────────────────────────────────────────────────┤     │
│ │ Using: Sequential list format                       │     │
│ └─────────────────────────────────────────────────────┘     │
│                                                             │
│ TraceId: abc123                                             │
│ Time: 2026-06-22 10:00:00 ~ 10:00:05                       │
│ Duration: 5000ms | Requests: 8                              │
│                                                             │
│ === Requests ===                                            │
│                                                             │
│ [1] 10:00:00.100 | order-service | 150ms                    │
│     POST /api/orders                                        │
│     Request: {"userId": "123"}                              │
│     Response: {"orderId": "ORD-001"}                        │
│                                                             │
│ [2] 10:00:00.300 | payment-service | 2000ms ⚠️              │
│     POST /api/payments                                      │
│     Request: {"orderId": "ORD-001"}                         │
│     Response: {"status": "success"}                         │
└─────────────────────────────────────────────────────────────┘
```

**Caption**: "FlowMind learns your format preference and applies it automatically"

---

### 2. Learning Confirmation

**Scene**: Brain emoji with checkmark

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    🧠 Learning Captured                     │
│                                                             │
│    ┌─────────────────────────────────────────────────┐      │
│    │                                                 │      │
│    │  ✓ Format preference saved                      │      │
│    │  ✓ Linked to log-audit skill                    │      │
│    │  ✓ Ready to apply                               │      │
│    │                                                 │      │
│    └─────────────────────────────────────────────────┘      │
│                                                             │
│              "Learn once, flow forever"                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Caption**: "FlowMind remembers your preferences forever"

---

### 3. Scene Mapping

**Scene**: Workflow visualization

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    🎯 Scene Mapping                         │
│                                                             │
│    ┌─────────────────────────────────────────────────┐      │
│    │                                                 │      │
│    │  Scene: Problem Debugging                       │      │
│    │                                                 │      │
│    │  Workflow:                                      │      │
│    │  ┌─────────┐    ┌─────────┐    ┌─────────┐     │      │
│    │  │ Error   │ →  │ Trace   │ →  │ Code    │     │      │
│    │  │ Logs    │    │ Chain   │    │ Review  │     │      │
│    │  └─────────┘    └─────────┘    └─────────┘     │      │
│    │                                                 │      │
│    │  Keywords: 排查, 问题, debug                     │      │
│    │  Used: 5 times                                  │      │
│    │                                                 │      │
│    └─────────────────────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Caption**: "Define workflows once, execute them automatically"

---

### 4. Before/After Comparison

**Scene**: Split screen comparison

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│         ❌ Before FlowMind    │    ✅ After FlowMind        │
│    ───────────────────────────┼────────────────────────     │
│                               │                             │
│    Day 1:                     │    Day 1:                   │
│    "Format as table"          │    "Format as table"        │
│    → AI: [table]              │    → AI: [table]            │
│                               │                             │
│    Day 2:                     │    Day 2:                   │
│    "Format as table"          │    "Format anything"        │
│    → AI: [list] ❌            │    → AI: [table] ✓          │
│                               │                             │
│    Day 3:                     │    Day 3:                   │
│    "FORMAT AS TABLE!!!"       │    "Format data"            │
│    → AI: [table] 😤           │    → AI: [table] ✓          │
│                               │                             │
│    Time wasted: 30%           │    Time saved: 30%          │
│                               │                             │
└─────────────────────────────────────────────────────────────┘
```

**Caption**: "Stop repeating yourself. FlowMind learns."

---

### 5. Skills Overview

**Scene**: Skill cards

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    FlowMind Skills                          │
│                                                             │
│    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│    │ 🔍          │  │ 📝          │  │ 🔌          │       │
│    │ Log Audit   │  │ Code Review │  │ Resource    │       │
│    │             │  │             │  │ Bind        │       │
│    │ • Traces    │  │ • Security  │  │ • Database  │       │
│    │ • Errors    │  │ • Quality   │  │ • Redis     │       │
│    │ • Perf      │  │ • Style     │  │ • API       │       │
│    └─────────────┘  └─────────────┘  └─────────────┘       │
│                                                             │
│    ┌─────────────┐  ┌─────────────┐  ┌─────────────┐       │
│    │ ✅          │  │ 📚          │  │ 🔄          │       │
│    │ Data        │  │ API Sync    │  │ Auto Flow   │       │
│    │ Validation  │  │             │  │             │       │
│    │ • Integrity │  │ • Generate  │  │ • Workflows │       │
│    │ • Logic     │  │ • Sync      │  │ • Automation│       │
│    │ • Quality   │  │ • Version   │  │ • Scheduling│       │
│    └─────────────┘  └─────────────┘  └─────────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Caption**: "Extensible skill system for every development task"

---

### 6. Team Sharing

**Scene**: Multiple terminals connected

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    Team Knowledge Sharing                   │
│                                                             │
│    ┌─────────────┐                    ┌─────────────┐       │
│    │ Developer A │                    │ Developer B │       │
│    │             │    flowmind.json   │             │       │
│    │ "Use table  │ ─────────────────→ │ "Use table  │       │
│    │  format"    │                    │  format"    │       │
│    └─────────────┘                    └─────────────┘       │
│           │                                  │              │
│           │          ┌─────────┐             │              │
│           └─────────→│ Shared  │←────────────┘              │
│                      │ Learnings│                           │
│                      └─────────┘                           │
│                             │                               │
│                      ┌─────────────┐                       │
│                      │ Developer C │                       │
│                      │ (New hire)  │                       │
│                      │ Instant     │                       │
│                      │ onboarding! │                       │
│                      └─────────────┘                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Caption**: "Share learnings across your team instantly"

---

## 🎨 Design Guidelines

### Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Primary Blue | `#0066FF` | Main brand color |
| Success Green | `#00CC66` | Learning confirmations |
| Warning Orange | `#FF9900` | Warnings |
| Error Red | `#FF3333` | Errors |
| Background Dark | `#1A1A2E` | Terminal background |
| Text Light | `#FFFFFF` | Terminal text |

### Typography

- **Headings**: Inter Bold
- **Body**: Inter Regular
- **Code**: JetBrains Mono

### Logo Usage

```
┌─────────────────────────────────────────┐
│                                         │
│           🧠 FlowMind                   │
│                                         │
│    "Learn once, flow forever"           │
│                                         │
└─────────────────────────────────────────┘
```

---

## 📐 Image Specifications

### Social Media

| Platform | Size | Format |
|----------|------|--------|
| Twitter | 1200×675 | PNG |
| LinkedIn | 1200×627 | PNG |
| GitHub | 1280×800 | PNG |
| Product Hunt | 1270×760 | PNG |

### Documentation

| Type | Size | Format |
|------|------|--------|
| Hero Image | 1920×1080 | PNG |
| Feature Card | 800×600 | PNG |
| Icon | 512×512 | PNG |

### Pitch Deck

| Slide | Size | Format |
|-------|------|--------|
| Title | 1920×1080 | PNG |
| Content | 1920×1080 | PNG |
| Demo | 1920×1080 | PNG |

---

## 🛠️ Tools for Creating Screenshots

### Terminal Screenshots

- **Carbon**: [carbon.now.sh](https://carbon.now.sh)
- **Codepng**: [codepng.io](https://codepng.io)
- **Terminalizer**: [terminalizer.com](https://terminalizer.com)

### Diagrams

- **Excalidraw**: [excalidraw.com](https://excalidraw.com)
- **Mermaid**: [mermaid.live](https://mermaid.live)
- **Draw.io**: [draw.io](https://draw.io)

### Mockups

- **Figma**: [figma.com](https://figma.com)
- **Canva**: [canva.com](https://canva.com)

---

## 📁 File Organization

```
demo/
├── screenshots/
│   ├── hero-image.png
│   ├── learning-demo.png
│   ├── scene-mapping.png
│   ├── before-after.png
│   ├── skills-overview.png
│   └── team-sharing.png
├── diagrams/
│   ├── architecture.png
│   ├── workflow.png
│   └── learning-flow.png
├── logos/
│   ├── flowmind-logo.png
│   ├── flowmind-icon.png
│   └── flowmind-dark.png
└── social/
    ├── twitter-card.png
    ├── linkedin-banner.png
    └── github-header.png
```

---

<div align="center">

**Create compelling visuals that show FlowMind's "wow" moment!**

*The best screenshot shows learning in action.*

</div>
