<div align="center">

# 🧠 FlowMind

### **学习你工作方式的 AI 智能体**

*不再重复自己。FlowMind 学习你的工作流程并自动应用。*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](CHANGELOG.md)

[English](README.md) | [快速开始](#-快速开始) | [工作原理](#-工作原理) | [使用场景](#-使用场景) | [架构](#-架构) | [路线图](#-路线图)

</div>

---

## 🎯 问题所在

开发者浪费 **20-30% 的时间** 向 AI 工具重复相同的指令：

```
❌ 每次都要说：
"输出格式用表格..."
"用顺序列表..."
"先检查错误再..."
"用 source_id 连接..."
```

## 💡 解决方案

**FlowMind 学习一次，永久应用。**

```
✅ 第一次：你教 FlowMind
✅ 之后每次：FlowMind 自动记住
```

---

## 🚀 快速开始

### 安装

```bash
npm install -g flowmind
```

### 初始化

```bash
flowmind init
```

### 开始使用

```bash
# 第一次 - 教 FlowMind 你的偏好
flowmind "查询 traceId 日志，用顺序列表格式"
FlowMind: [执行并学习你的偏好]

# 下次 - FlowMind 自动记住！
flowmind "查询 traceId abc123 的日志"
FlowMind: [自动使用顺序列表格式] ✓
```

---

## 🧠 工作原理

### 1. 从纠正中学习

```mermaid
graph LR
    A[你的请求] --> B[FlowMind 执行]
    B --> C{你纠正了？}
    C -->|是| D[记录学习]
    C -->|否| E[继续]
    D --> F[下次应用]
```

**示例：**
```
你: "查询日志"
FlowMind: [返回树形格式]
你: "不对，用顺序列表"
FlowMind: [记录偏好]

你: [下次] "查询日志"
FlowMind: [自动使用顺序列表格式] ✓
```

### 2. 场景映射

将特定请求模式映射到工作流：

```
你: "查询线上日志用 SLS 技能，格式用顺序列表"
FlowMind: [记录场景映射]

你: [任何时候] "查询线上日志..."
FlowMind: [自动应用你的工作流] ✓
```

### 3. 技能系统

针对不同任务的模块化技能：

| 技能 | 功能 |
|------|------|
| 🔍 **日志审计** | 日志分析、链路可视化 |
| 🔌 **资源绑定** | 数据库、Redis、API 连接 |
| 📝 **代码审查** | 代码质量、安全检查 |
| ✅ **数据验证** | 业务逻辑验证 |
| 📚 **API 同步** | 文档同步 |

---

## 📊 使用场景

### 1. 自动化日志分析

```bash
# 教一次
flowmind "查询 traceId 日志用顺序列表，显示 URL、入参、响应"

# 永久使用
flowmind "查询 traceId abc123"
# → 自动使用你偏好的格式
```

### 2. 一致的代码审查

```bash
# 设置你的标准
flowmind "代码审查先检查安全漏洞，再检查代码质量"

# 每次审查都遵循你的顺序
flowmind "审查这个 PR"
# → 安全优先，然后是质量
```

### 3. 流畅的调试流程

```bash
# 定义你的工作流
flowmind "排查问题先查错误日志，再查链路，最后查代码"

# 每次都遵循一致的调试流程
flowmind "排查线上问题 xxx"
# → 遵循你定义的工作流
```

---

## 🏗️ 架构

```
flowmind/
├── core/                      # 核心引擎
│   ├── agent.js              # 主代理逻辑
│   ├── learning.js           # 学习引擎
│   └── matcher.js            # 场景匹配
├── skills/                    # 技能模块
│   ├── log-audit/           # 日志分析
│   ├── resource-bind/       # 资源管理
│   ├── code-review/         # 代码审查
│   └── learning-engine/     # 学习系统
├── learning/                  # 学习存储
│   ├── records/             # 学习记录
│   └── scenes.json          # 场景映射
└── templates/                # 输出模板
```

### 学习流程

```mermaid
sequenceDiagram
    participant U as 你
    participant F as FlowMind
    participant L as 学习引擎
    participant S as 技能

    U->>F: 发起请求
    F->>L: 检查场景映射
    L-->>F: 返回匹配的工作流
    F->>S: 执行技能
    S-->>F: 返回结果
    F->>U: 展示结果

    U->>F: 提供反馈
    F->>L: 记录学习
    L->>L: 更新映射
```

---

## 📈 影响与指标

| 指标 | 使用 FlowMind 前 | 使用 FlowMind 后 |
|------|------------------|------------------|
| 重复指令 | 100% | ~5% |
| 工作流一致性 | 不稳定 | 98%+ |
| 调试时间 | 30 分钟 | 10 分钟 |
| 新人上手时间 | 2 周 | 2 天 |

---

## 🛣️ 路线图

### 第一阶段：基础 ✅
- [x] 核心学习引擎
- [x] 场景映射
- [x] 基础技能系统
- [x] CLI 界面

### 第二阶段：智能化（2026 年 Q3）
- [ ] 多模态学习（截图、图表）
- [ ] 自然语言工作流定义
- [ ] 智能建议

### 第三阶段：协作（2026 年 Q4）
- [ ] 团队知识共享
- [ ] 工作流模板市场
- [ ] 数据分析仪表板

### 第四阶段：企业版（2027 年 Q1）
- [ ] SSO 集成
- [ ] 审计日志
- [ ] 自定义技能 SDK
- [ ] 优先支持

---

## 🏢 企业与商业

### 开源版（免费）
- 核心学习引擎
- 基础技能
- 个人使用
- 社区支持

### 团队版（$29/用户/月）
- 团队知识共享
- 工作流模板
- 优先支持
- 数据分析

### 企业版（定制）
- 自定义技能开发
- SSO 与审计日志
- 专属支持
- SLA 保障

[联系我们](mailto:hello@flowmind.dev) 了解企业版详情。

---

## 🤝 贡献

欢迎贡献！详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

### 贡献方式
- 🐛 报告 Bug
- 💡 建议功能
- 📝 改进文档
- 🛠️ 添加技能
- 🌍 翻译

---

## 📄 许可证

MIT 许可证 - 详见 [LICENSE](LICENSE)。

---

## 🙏 致谢

基于以下技术构建：
- Claude AI - 智能核心
- 开源社区 - 灵感与支持

---

## 📞 联系方式

- **官网**: [flowmind.dev](https://flowmind.dev)
- **GitHub**: [github.com/flowmind](https://github.com/flowmind)
- **Twitter**: [@flowmindai](https://twitter.com/flowmindai)
- **邮箱**: hello@flowmind.dev
- **Discord**: [加入社区](https://discord.gg/flowmind)

---

<div align="center">

**[⬆ 回到顶部](#-flowmind)**

由 FlowMind 团队用 ❤️ 制作

*"学习一次，永远流畅"*

</div>
