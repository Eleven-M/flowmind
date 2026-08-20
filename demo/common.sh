#!/usr/bin/env bash

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export FLOWMIND_HOME="${FLOWMIND_HOME:-$ROOT_DIR/.flowmind-demo}"

if [[ "${FLOWMIND_USE_LOCAL:-0}" == "1" ]]; then
  FLOWMIND_CMD=("node" "$ROOT_DIR/bin/flowmind.js")
elif command -v flowmind >/dev/null 2>&1; then
  FLOWMIND_CMD=("flowmind")
else
  FLOWMIND_CMD=("node" "$ROOT_DIR/bin/flowmind.js")
fi

flowmind_label() {
  if [[ "${FLOWMIND_CMD[0]}" == "flowmind" ]]; then
    printf 'flowmind'
    return
  fi

  printf 'node ./bin/flowmind.js'
}

run_flowmind() {
  "${FLOWMIND_CMD[@]}" "$@"
}
