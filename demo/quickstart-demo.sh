#!/usr/bin/env bash

set -euo pipefail

echo
echo "== FlowMind quickstart demo =="
echo

echo "$ npm install -g flowmind"
echo "Install FlowMind globally before running this script."
echo
sleep 1

echo "$ flowmind skills --json"
flowmind skills --json || true
echo
sleep 1

echo '$ flowmind process --skill log-audit "查询 traceId demo-123 的日志" --json'
flowmind process --skill log-audit "查询 traceId demo-123 的日志" --json || true
echo
sleep 1

echo '$ flowmind "下次日志结果用表格格式"'
flowmind "下次日志结果用表格格式" || true
echo
sleep 1

echo '$ flowmind process --skill log-audit "查询 traceId demo-456 的日志" --json'
flowmind process --skill log-audit "查询 traceId demo-456 的日志" --json || true
echo

echo "== Demo complete =="
