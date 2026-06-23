---
name: data-validation
description: Data validation and logic verification skill for FlowMind. Verify business logic, data integrity, and processing correctness.
metadata:
  version: "1.0.0"
  author: flowmind
  category: quality
---

# Data Validation Skill

Verify business logic, data integrity, and processing correctness.

## Features

### 📊 Data Integrity
- Referential integrity checks
- Data type validation
- Range and constraint validation
- Null/required field checks

### 🔄 Business Logic
- Workflow validation
- Calculation verification
- State machine validation
- Rule engine checks

### 📈 Data Quality
- Duplicate detection
- Consistency checks
- Completeness analysis
- Accuracy verification

## Trigger Patterns

```
"数据验证", "data validation", "validate"
"逻辑验证", "logic verification"
"数据检查", "data check"
"业务逻辑", "business logic"
"数据质量", "data quality"
```

## Output Format

```
┌─────────────────────────────────────────────────────┐
│ Data Validation Report                              │
├─────────────────────────────────────────────────────┤
│ Table: {table_name}                                 │
│ Records: {count}                                    │
├─────────────────────────────────────────────────────┤
│ ✓ Passed: {pass_count}                              │
│ ✗ Failed: {fail_count}                              │
│ ⚠ Warnings: {warn_count}                           │
├─────────────────────────────────────────────────────┤
│ Issues:                                             │
│ • {issue_description}                               │
│ • {issue_description}                               │
└─────────────────────────────────────────────────────┘
```

## Validation Types

### Schema Validation

| Check | Description |
|-------|-------------|
| Type Match | Field types match schema |
| Required Fields | All required fields present |
| Length Limits | String lengths within limits |
| Format | Dates, emails, phones valid |

### Business Rules

| Check | Description |
|-------|-------------|
| Calculations | Totals, averages correct |
| State Transitions | Valid state changes |
| Dependencies | Required relationships exist |
| Constraints | Business rules satisfied |

## Learning Integration

This skill supports FlowMind learning:

- **Validation Rules**: Learns your business rules
- **Error Tolerance**: Learns acceptable error rates
- **Output Format**: Learns preferred report format

```
User: "金额不能为负数"
FlowMind: ✓ Learned: Amount must be non-negative

User: [Next validation]
FlowMind: [Checks for negative amounts]
```

## Examples

### Example 1: Order Validation

```
User: 验证订单数据的正确性

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Order Validation Report                             │
├─────────────────────────────────────────────────────┤
│ Table: orders                                       │
│ Records: 1,000                                      │
├─────────────────────────────────────────────────────┤
│ ✓ Passed: 985                                       │
│ ✗ Failed: 15                                        │
│ ⚠ Warnings: 5                                       │
├─────────────────────────────────────────────────────┤
│ Critical Issues:                                    │
│ • 10 orders with negative total                     │
│ • 5 orders with missing customer_id                 │
├─────────────────────────────────────────────────────┤
│ Warnings:                                           │
│ • 5 orders with future dates                        │
└─────────────────────────────────────────────────────┘
```

### Example 2: Calculation Verification

```
User: 验证订单金额计算是否正确

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Calculation Verification                            │
├─────────────────────────────────────────────────────┤
│ Formula: subtotal + tax = total                     │
│ Records Checked: 500                                │
├─────────────────────────────────────────────────────┤
│ ✓ Correct: 498 (99.6%)                              │
│ ✗ Incorrect: 2 (0.4%)                               │
├─────────────────────────────────────────────────────┤
│ Errors:                                             │
│ • Order #1234: Expected 110.00, Got 100.00          │
│ • Order #5678: Expected 55.50, Got 55.00            │
└─────────────────────────────────────────────────────┘
```

## Configuration

```json
{
  "data-validation": {
    "rules": {
      "required": ["id", "created_at", "status"],
      "types": {
        "id": "integer",
        "email": "email",
        "phone": "phone"
      },
      "ranges": {
        "age": { "min": 0, "max": 150 },
        "amount": { "min": 0 }
      }
    },
    "business": {
      "calculations": [
        {
          "name": "order_total",
          "formula": "subtotal + tax = total",
          "tolerance": 0.01
        }
      ]
    }
  }
}
```

## Custom Rules

### Define Custom Validation

```json
{
  "data-validation": {
    "customRules": [
      {
        "name": "valid_email",
        "field": "email",
        "pattern": "^[\\w.-]+@[\\w.-]+\\.\\w+$",
        "message": "Invalid email format"
      }
    ]
  }
}
```

### Business Rule Validation

```json
{
  "data-validation": {
    "businessRules": [
      {
        "name": "order_amount",
        "condition": "amount > 0",
        "message": "Order amount must be positive"
      }
    ]
  }
}
```