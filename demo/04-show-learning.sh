#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/common.sh"

printf '$ cat $FLOWMIND_HOME/.flowmind/learning/records/global/preferences.json\n'
cat "$FLOWMIND_HOME/.flowmind/learning/records/global/preferences.json"
