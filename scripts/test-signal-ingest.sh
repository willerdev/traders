#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:4000/api/v1}"
KEY="${SETUP_FEED_API_KEY:?Set SETUP_FEED_API_KEY}"

REF="test-ingest-$(date +%s)"

echo "POST $API_BASE/feeds/signals"
curl -sS -X POST "$API_BASE/feeds/signals" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $KEY" \
  -d "{
    \"pair\": \"XAUUSD\",
    \"direction\": \"BUY\",
    \"entry\": 2650.50,
    \"sl\": 2645.00,
    \"tp\": 2661.00,
    \"comment\": \"Signal ingest API test\",
    \"external_id\": \"$REF\"
  }" | python3 -m json.tool

echo ""
echo "Idempotent retry (should return status=exists):"
curl -sS -X POST "$API_BASE/feeds/signals" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $KEY" \
  -d "{
    \"pair\": \"XAUUSD\",
    \"direction\": \"BUY\",
    \"entry\": 2650.50,
    \"sl\": 2645.00,
    \"tp\": 2661.00,
    \"external_id\": \"$REF\"
  }" | python3 -m json.tool
