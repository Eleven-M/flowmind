#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/common.sh"

DEMO_HOME="$FLOWMIND_HOME"
CONFIG_DIR="$DEMO_HOME/.flowmind"

rm -rf "$DEMO_HOME"
mkdir -p "$CONFIG_DIR"

cat > "$CONFIG_DIR/config.json" <<EOF
{
  "version": "1.4.5",
  "learning": {
    "enabled": true,
    "autoApply": true,
    "confidenceThreshold": 0.7,
    "storagePath": "$CONFIG_DIR/learning"
  },
  "sceneMapping": {
    "enabled": true,
    "weights": {
      "keywordMatch": 0.4,
      "patternMatch": 0.3,
      "historyScore": 0.2,
      "confidence": 0.1
    }
  }
}
EOF

echo "Prepared demo home: $DEMO_HOME"
