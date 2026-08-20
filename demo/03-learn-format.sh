#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/common.sh"
FLOWMIND_LABEL="$(flowmind_label)"

printf '$ %s process "下次日志结果用表格格式"\n' "$FLOWMIND_LABEL"
run_flowmind process "下次日志结果用表格格式"
