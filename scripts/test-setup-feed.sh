#!/usr/bin/env bash
# Test the Setup Feed API (production or local).
# Usage:
#   SETUP_FEED_API_KEY=your-key ./scripts/test-setup-feed.sh
#   API_BASE=https://traders-c53s.onrender.com/api/v1/feeds SETUP_FEED_API_KEY=your-key ./scripts/test-setup-feed.sh

set -euo pipefail

API_BASE="${API_BASE:-https://traders-c53s.onrender.com/api/v1/feeds}"
KEY="${SETUP_FEED_API_KEY:?Set SETUP_FEED_API_KEY}"

echo "=== Setup Feed test ==="
echo "Host: $API_BASE"
echo ""

echo "--- List OPEN setups (limit 5) ---"
curl -sS -w "\nHTTP %{http_code}\n" \
  -H "X-Api-Key: $KEY" \
  "${API_BASE}/setups?status=OPEN&limit=5"
echo ""

SIGNAL_ID="${1:-}"
if [[ -n "$SIGNAL_ID" ]]; then
  echo "--- Get setup $SIGNAL_ID ---"
  curl -sS -w "\nHTTP %{http_code}\n" \
    -H "X-Api-Key: $KEY" \
    "${API_BASE}/setups/${SIGNAL_ID}"
  echo ""
fi
