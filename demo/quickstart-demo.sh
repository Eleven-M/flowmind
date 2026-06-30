#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/common.sh"
FLOWMIND_LABEL="$(flowmind_label)"

echo
echo "== FlowMind quickstart demo =="
echo

echo "$ ${FLOWMIND_LABEL} skills --json"
echo "This script uses the global FlowMind binary when available, otherwise falls back to the local repo binary."
echo
sleep 1

run_flowmind skills --json || true
echo
sleep 1

echo "$ ${FLOWMIND_LABEL} process --skill log-audit \"查询 traceId demo-123 的日志\" --json"
run_flowmind process --skill log-audit "查询 traceId demo-123 的日志" --json || true
echo
sleep 1

echo "$ ${FLOWMIND_LABEL} process \"下次日志结果用表格格式\""
run_flowmind process "下次日志结果用表格格式" || true
echo
sleep 1

echo "$ ${FLOWMIND_LABEL} process --skill log-audit \"查询 traceId demo-456 的日志\" --json"
run_flowmind process --skill log-audit "查询 traceId demo-456 的日志" --json || true
echo

echo "== Demo complete =="
