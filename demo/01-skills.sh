#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/common.sh"
FLOWMIND_LABEL="$(flowmind_label)"

printf '$ %s skills --json | jq '\''.skills[:4] | map({name, category, version})'\''\n' "$FLOWMIND_LABEL"
run_flowmind skills --json | jq '.skills[:4] | map({name, category, version})'
