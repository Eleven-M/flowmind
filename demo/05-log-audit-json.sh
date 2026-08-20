#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/common.sh"
FLOWMIND_LABEL="$(flowmind_label)"

printf '$ %s process --skill log-audit "查询 traceId demo-456 的日志" --json | jq '\''{skill: .metadata.skill, traceId: .data.data.params.traceId, message: .data.message}'\''\n' "$FLOWMIND_LABEL"
run_flowmind process --skill log-audit "查询 traceId demo-456 的日志" --json | jq '{skill: .metadata.skill, traceId: .data.data.params.traceId, message: .data.message}'
