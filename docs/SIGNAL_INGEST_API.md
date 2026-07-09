# External Signal Ingest API

Third-party systems can **post trading signals** into TraderRank Pro using a shared API key. Each signal becomes an **OPEN setup** with pair, entry, stop loss, take profit, and comment — the same fields traders submit manually.

## Quick start (production)

| | |
|---|---|
| **API host** | `https://traders-c53s.onrender.com` |
| **Ingest endpoint** | `POST /api/v1/feeds/signals` |
| **Auth header** | `X-Api-Key: <your SETUP_FEED_API_KEY>` |
| **Content-Type** | `application/json` |

```bash
export SETUP_FEED_API_KEY="your-key-here"

curl -s -X POST "https://traders-c53s.onrender.com/api/v1/feeds/signals" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $SETUP_FEED_API_KEY" \
  -d '{
    "pair": "XAUUSD",
    "direction": "BUY",
    "entry": 2650.50,
    "sl": 2645.00,
    "tp": 2661.00,
    "comment": "Gold breakout — London session"
  }'
```

**Success response (201-style body, HTTP 200):**

```json
{
  "status": "created",
  "signalId": "cmxxxxxxxx",
  "symbol": "XAUUSD",
  "direction": "BUY",
  "entry": { "min": 2650.367475, "max": 2650.632525, "mid": 2650.5 },
  "stopLoss": 2645,
  "takeProfit": 2661,
  "riskRewardRatio": 1.91,
  "comment": "Gold breakout — London session",
  "setupStatus": "OPEN",
  "submittedAt": "2026-07-10T02:00:00.000Z"
}
```

---

## Authentication

Uses the same key as the [Setup Feed API](./SETUP_FEED_API.md) (read setups):

```bash
SETUP_FEED_API_KEY="your-long-random-secret"
```

Send the key on every request using **one** of:

| Method | Example |
|--------|---------|
| Header (recommended) | `X-Api-Key: your-long-random-secret` |
| Bearer token | `Authorization: Bearer your-long-random-secret` |
| Query string | `?api_key=your-long-random-secret` (avoid in production logs) |

| HTTP code | Meaning |
|-----------|---------|
| `401` | Invalid or missing API key |
| `503` | `SETUP_FEED_API_KEY` not configured on the server |

**Render:** add `SETUP_FEED_API_KEY` on the **traders-api** service and redeploy.

---

## POST /api/v1/feeds/signals

Create a new trading setup from your signal provider.

### Request body

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `pair` | ✓* | string | Trading pair, e.g. `XAUUSD`, `EURUSD` |
| `symbol` | ✓* | string | Alias for `pair` |
| `direction` | ✓ | string | `BUY` or `SELL` |
| `entry` | ✓* | number | Single entry price |
| `entry_price` | ✓* | number | Alias for `entry` |
| `entry_min` | ✓* | number | Entry zone low (use with `entry_max`) |
| `entry_max` | ✓* | number | Entry zone high |
| `sl` | ✓* | number | Stop loss price |
| `stop_loss` | ✓* | number | Alias for `sl` |
| `tp` | ✓* | number | Take profit price |
| `take_profit` | ✓* | number | Alias for `tp` |
| `comment` | | string | Signal note / rationale (max 2000 chars) |
| `description` | | string | Alias for `comment` |
| `external_id` | | string | Your idempotency key (max 128 chars). If a setup with this `signalId` already exists, the API returns it without creating a duplicate. |

\* Provide one of each group: `pair` **or** `symbol`; entry as `entry`/`entry_price` **or** `entry_min`+`entry_max`; `sl` **or** `stop_loss`; `tp` **or** `take_profit`.

### Validation rules

- **BUY:** stop loss must be **below** entry; take profit must be **above** entry.
- **SELL:** stop loss must be **above** entry; take profit must be **below** entry.
- When you send a single `entry` price, the platform creates a tight entry zone around it automatically.

### Example — SELL with entry zone

```json
{
  "symbol": "EURUSD",
  "direction": "SELL",
  "entry_min": 1.0850,
  "entry_max": 1.0860,
  "stop_loss": 1.0880,
  "take_profit": 1.0800,
  "comment": "EUR rejection at daily resistance",
  "external_id": "my-bot-signal-20260710-001"
}
```

### Example — minimal BUY

```json
{
  "pair": "BTCUSD",
  "direction": "BUY",
  "entry": 98500,
  "sl": 97800,
  "tp": 100200,
  "comment": "BTC momentum long"
}
```

### Idempotent repost (same external_id)

```json
{
  "status": "exists",
  "signalId": "my-bot-signal-20260710-001",
  "symbol": "EURUSD",
  "direction": "SELL",
  "entry": { "min": 1.085, "max": 1.086 },
  "stopLoss": 1.088,
  "takeProfit": 1.08,
  "comment": "EUR rejection at daily resistance",
  "setupStatus": "OPEN"
}
```

---

## Error responses

| HTTP | Example message |
|------|-----------------|
| `400` | `pair or symbol is required` |
| `400` | `sl or stop_loss is required` |
| `400` | `For BUY signals, stop loss must be below the entry range` |
| `401` | `Invalid or missing API key` |
| `503` | `SETUP_FEED_API_KEY is not configured on the server` |

---

## What happens after ingest

1. An **OPEN** setup is stored (visible on the platform and via `GET /api/v1/feeds/setups`).
2. The setup is attributed to the platform **API Signals** sender (configurable via env).
3. If MetaAPI / Signal Hub is configured, limit execution is queued in the background (same as trader-submitted setups).

### Optional server env

| Variable | Default | Purpose |
|----------|---------|---------|
| `SETUP_FEED_API_KEY` | — | Required for auth |
| `EXTERNAL_SIGNAL_SENDER_NAME` | `API Signals` | Display name on ingested setups |
| `EXTERNAL_SIGNAL_USER_EMAIL` | `external-signals@traderrank.internal` | Internal owner account for API signals |

---

## Read setups back (optional)

Use the [Setup Feed API](./SETUP_FEED_API.md) to list or fetch setups you created:

```bash
curl -s -H "X-Api-Key: $SETUP_FEED_API_KEY" \
  "https://traders-c53s.onrender.com/api/v1/feeds/setups?status=OPEN&symbol=XAUUSD"
```

---

## Local development

```bash
# backend/.env
SETUP_FEED_API_KEY=dev-test-key

curl -s -X POST "http://localhost:4000/api/v1/feeds/signals" \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: dev-test-key" \
  -d '{"pair":"XAUUSD","direction":"BUY","entry":2650,"sl":2645,"tp":2660,"comment":"test"}'
```

Or run:

```bash
SETUP_FEED_API_KEY=dev-test-key ./scripts/test-signal-ingest.sh
```

---

## Integration checklist

1. Generate a long random API key (32+ chars).
2. Set `SETUP_FEED_API_KEY` on **traders-api** (Render) and redeploy.
3. POST signals with `X-Api-Key` header.
4. Use `external_id` to avoid duplicates when retrying webhooks.
5. Poll `GET /feeds/setups/:signalId` or list endpoint to confirm status.
