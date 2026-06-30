#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/common.sh"
FLOWMIND_LABEL="$(flowmind_label)"

printf '$ %s process --skill log-audit "查询 traceId demo-123 的日志"\n' "$FLOWMIND_LABEL"
run_flowmind process --skill log-audit "查询 traceId demo-123 的日志"
