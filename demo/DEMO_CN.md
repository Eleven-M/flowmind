<div align="center">

# FlowMind 使用演示

**如何在日常工作中使用 FlowMind**

[English](DEMO.md)

</div>

---

![FlowMind 终端演示](flowmind-demo.gif)

## 快速开始

### 安装

```bash
npm install -g flowmind
```

### 初始化

```bash
flowmind init
```

> 一次性配置，永久生效。配置资源连接、学习偏好、输出格式。

---

## 场景 1：线上问题排查

**使用 FlowMind 前（10+ 步骤）：**
```
登录 SLS → 查日志 → 找 traceId → 查链路 → 连 RDS → 查数据 → 定位代码 → 修复 → 部署 → 写文档
```

**使用 FlowMind（1 个命令）：**
```bash
flowmind "排查线上问题 traceId abc123"
```

FlowMind 自动完成：SLS 查询 → 链路追踪 → RDS 数据验证 → 代码定位 → 修复建议

### 分步操作

```bash
# 1. 用你喜欢的格式查询日志
flowmind "查询 traceId abc123 的日志，用顺序列表格式"

# 2. FlowMind 学习了你的偏好
# 下次只需要：
flowmind "查询 traceId def456 的日志"
# → 自动使用顺序列表格式
```

---

## 场景 2：代码审查

### 设置你的标准（只需一次）

```bash
flowmind "代码审查先检查安全漏洞，再检查代码质量，最后检查性能"
```

### 审查任意 PR

```bash
flowmind "审查这个 PR"
# → 安全优先 → 质量检查 → 性能分析
```

### 审查特定文件

```bash
flowmind "审查 src/api/users.js 的安全漏洞"
```

---

## 场景 3：数据验证

### 验证订单数据

```bash
flowmind "验证订单表数据完整性"
# → 引用完整性 → 数据类型 → 业务逻辑 → 状态机
```

### 验证计算逻辑

```bash
flowmind "验证订单金额计算是否正确"
```

### 检查 Redis 缓存

```bash
flowmind "验证缓存逻辑，检查 store:{storeId}:config 的结构"
```

---

## 场景 4：API 文档

### 从代码生成

```bash
flowmind "从代码注释生成 API 文档"
```

### 同步到 YApi

```bash
flowmind "同步 OrderController 的接口到 YApi"
```

### 同步到语雀

```bash
flowmind "同步 API 文档到语雀"
```

---

## 场景 5：日志分析

### 链路追踪

```bash
flowmind "查询 traceId abc123 的完整链路"
```

### 错误排查

```bash
flowmind "查看最近1小时的错误日志"
```

### 性能分析

```bash
flowmind "分析 payment-service 接口耗时"
```

---

## 场景 6：项目健康检查

```bash
flowmind "审查项目整体状况"
# → 依赖分析 → 安全审计 → 代码复杂度 → 测试覆盖率 → 技术债务
```

### 安全审计

```bash
flowmind "进行安全审计"
```

---

## 学习系统

### 工作原理

```bash
# 第一次 - 教 FlowMind
flowmind "查询日志用顺序列表格式"
FlowMind: ✓ 已学习

# 下次 - FlowMind 记住了
flowmind "查询 traceId abc123 的日志"
FlowMind: [自动使用顺序列表格式]
```

### 场景映射

```bash
# 定义工作流
flowmind "排查问题先查错误日志，再查链路，最后查代码"
FlowMind: ✓ 工作流已保存

# 随时使用
flowmind "排查线上问题 order-123"
FlowMind: [自动遵循你的工作流]
```

### 查看学习记录

```bash
# 列出所有学习记录
flowmind learn list

# 列出场景映射
flowmind scenes list

# 导出供团队共享
flowmind learn export team.json

# 从队友导入
flowmind learn import team.json
```

---

## 常用命令

| 命令 | 说明 |
|------|------|
| `flowmind "你的请求"` | 执行任务 |
| `flowmind init` | 初始化配置 |
| `flowmind skills` | 列出可用技能 |
| `flowmind learn list` | 查看学习记录 |
| `flowmind scenes list` | 查看场景映射 |
| `flowmind learn export` | 导出学习记录 |
| `flowmind learn import` | 导入学习记录 |

---

## 可重复终端演示

在仓库根目录下，可以直接回放这套终端演示，不依赖全局安装：

```bash
./demo/setup-vhs-demo.sh
./demo/01-skills.sh
./demo/02-log-audit.sh
./demo/03-learn-format.sh
./demo/04-show-learning.sh
./demo/05-log-audit-json.sh
```

如果要用 VHS 生成终端动画：

```bash
vhs demo/flowmind-demo.tape
```

## 使用技巧

1. **描述具体**：指令越详细，学习效果越好
2. **及时纠正**：告诉 FlowMind 哪里不对
3. **善用场景**：为重复任务定义工作流
4. **团队共享**：导出学习记录分享给团队

---

<div align="center">

**学习一次，永远流畅。**

</div>
