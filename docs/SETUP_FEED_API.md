# Setup Feed API

Third-party integrators can read trader-submitted setups from TraderRank Pro using a shared API key. Responses include the **pair/symbol**, **entry zone**, **stop loss**, and **take profit** for each setup.

## Authentication

Set on the server:

```bash
SETUP_FEED_API_KEY="your-long-random-secret"
```

Send the key on every request using **one** of:

| Method | Example |
|--------|---------|
| Header (recommended) | `X-Api-Key: your-long-random-secret` |
| Bearer token | `Authorization: Bearer your-long-random-secret` |
| Query string | `?api_key=your-long-random-secret` (avoid in production logs) |

Missing or wrong keys return `401 Unauthorized`. If the server has no key configured, requests return `503 Service Unavailable`.

## Base URL

```
https://YOUR_API_HOST/api/v1/feeds
```

Local development:

```
http://localhost:4000/api/v1/feeds
```

---

## List setups

```http
GET /api/v1/feeds/setups
```

### Query parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `status` | `OPEN` | `OPEN`, `PENDING`, `ACTIVE` (open + pending), `WON`, `LOST`, `ARCHIVED`, `CANCELLED`, or `ALL` |
| `symbol` | — | Filter by pair substring (case-insensitive), e.g. `EUR` |
| `since` | — | ISO-8601 timestamp; only setups submitted at or after this time |
| `limit` | `50` | Max items to return (1–100) |

### Example request

```bash
curl -s \
  -H "X-Api-Key: YOUR_SETUP_FEED_API_KEY" \
  "https://YOUR_API_HOST/api/v1/feeds/setups?status=OPEN&limit=20"
```

### Example response

```json
{
  "count": 2,
  "items": [
    {
      "signalId": "clx9abc123",
      "pair": "EURUSD",
      "symbol": "EURUSD",
      "direction": "BUY",
      "entry": {
        "min": 1.0845,
        "max": 1.0855,
        "mid": 1.085
      },
      "stopLoss": 1.082,
      "takeProfit": 1.092,
      "riskRewardRatio": 3.5,
      "status": "OPEN",
      "submittedAt": "2026-06-30T14:22:10.123Z"
    },
    {
      "signalId": "clx9def456",
      "pair": "XAUUSD",
      "symbol": "XAUUSD",
      "direction": "SELL",
      "entry": {
        "min": 2325.5,
        "max": 2328,
        "mid": 2326.75
      },
      "stopLoss": 2335,
      "takeProfit": 2305,
      "riskRewardRatio": 2.2,
      "status": "OPEN",
      "submittedAt": "2026-06-30T13:01:44.000Z"
    }
  ]
}
```

### Field reference

| Field | Description |
|-------|-------------|
| `signalId` | Unique setup id (use for deduplication) |
| `pair` / `symbol` | Trading pair (same value) |
| `direction` | `BUY` or `SELL` |
| `entry.min` / `entry.max` | Submitted entry zone |
| `entry.mid` | Midpoint of the entry zone |
| `stopLoss` | Stop loss price |
| `takeProfit` | Take profit price |
| `riskRewardRatio` | RR from mid entry to TP vs SL |
| `status` | Current setup status |
| `submittedAt` | When the trader submitted the setup (UTC) |

User identities, emails, and chart screenshots are **not** included in this feed.

---

## Get one setup

```http
GET /api/v1/feeds/setups/:signalId
```

### Example

```bash
curl -s \
  -H "X-Api-Key: YOUR_SETUP_FEED_API_KEY" \
  "https://YOUR_API_HOST/api/v1/feeds/setups/clx9abc123"
```

Returns a single object (same shape as one item in the list). `404` if the id does not exist.

---

## Polling guidance

- Poll `GET /feeds/setups?status=OPEN` every **30–60 seconds** for new ideas.
- Use `since` with the last `submittedAt` you processed to fetch only newer setups:

```bash
curl -s \
  -H "X-Api-Key: YOUR_KEY" \
  "https://YOUR_API_HOST/api/v1/feeds/setups?status=OPEN&since=2026-06-30T14:22:10.123Z"
```

- Store `signalId` on your side to avoid processing the same setup twice.

---

## Errors

| HTTP | Meaning |
|------|---------|
| `401` | Invalid or missing API key |
| `404` | Setup id not found (single-setup endpoint) |
| `503` | `SETUP_FEED_API_KEY` not configured on server |

---

## Security notes

- Rotate `SETUP_FEED_API_KEY` if it is leaked.
- Prefer the `X-Api-Key` header over query parameters.
- Do not expose the key in client-side apps or public repos.
- This feed is read-only; it cannot submit or modify setups.

---

## Node.js example

```javascript
const API_BASE = "https://YOUR_API_HOST/api/v1/feeds";
const API_KEY = process.env.SETUP_FEED_API_KEY;

async function fetchOpenSetups() {
  const res = await fetch(`${API_BASE}/setups?status=OPEN&limit=50`, {
    headers: { "X-Api-Key": API_KEY },
  });
  if (!res.ok) throw new Error(`Feed error ${res.status}`);
  const data = await res.json();
  for (const setup of data.items) {
    console.log(
      setup.pair,
      setup.direction,
      `entry ${setup.entry.min}-${setup.entry.max}`,
      `SL ${setup.stopLoss}`,
      `TP ${setup.takeProfit}`,
    );
  }
}
```

## Python example

```python
import os
import requests

API_BASE = "https://YOUR_API_HOST/api/v1/feeds"
headers = {"X-Api-Key": os.environ["SETUP_FEED_API_KEY"]}

r = requests.get(f"{API_BASE}/setups", params={"status": "OPEN", "limit": 50}, headers=headers, timeout=30)
r.raise_for_status()
for setup in r.json()["items"]:
    print(setup["pair"], setup["direction"], setup["entry"], setup["stopLoss"])
```
