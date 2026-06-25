# Trade lifecycle webhook

Send **opened**, **in-trade**, and **closed** events from your execution layer (MT5 bridge, Signal Hub worker, custom bot) so TraderRank can track who is in a trade, who hit TP, and who hit SL.

## Endpoint

```
POST /api/v1/signals/webhook/trades
```

**Production example:** `https://traders-c53s.onrender.com/api/v1/signals/webhook/trades`

## Authentication

Set `TRADE_OUTCOME_WEBHOOK_SECRET` on the backend, then send it on every request using **either**:

| Method | Example |
|--------|---------|
| Header | `x-webhook-secret: your-secret-here` |
| Query string | `?key=your-secret-here` |

In production the secret is **required**. Requests without a valid secret return `401`.

---

## Event types

| `event` | When to send | Platform effect |
|---------|----------------|-------------------|
| `opened` or `open` | Position filled / trade is live | Marks setup **in trade**, stores entry (and optional SL/TP) |
| `closed` | Position closed at TP or SL | Resolves setup as **WON** (TP) or **LOST** (SL), updates wallet & score |

---

## Required fields

### All events

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event` | `"opened"` \| `"open"` \| `"closed"` | Yes | Lifecycle stage |
| `sender` | string | Yes | Trader sender name (same format as Signal Hub — see below) |
| `signalId` | string | Recommended | Platform signal ID from `POST /signals` response |
| `external_id` | string | Alias | Same as `signalId` |

If `signalId` is omitted, the backend matches the **most recent OPEN** setup for that `sender` (and `symbol` if provided).

### `opened` / `open`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `entry` | number | Recommended | Fill / entry price |
| `sl` | number | Optional | Stop loss (defaults to setup SL) |
| `tp` | number | Optional | Take profit (defaults to setup TP) |
| `symbol` | string | Optional | e.g. `EURUSD`, `XAUUSD` |
| `direction` | `"buy"` \| `"sell"` | Optional | Trade direction |
| `ticket` | number | Optional | Broker ticket / position ID |
| `opened_at` | ISO string | Optional | When the trade opened |

### `closed`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `outcome` | `"tp"` \| `"sl"` | Recommended | How the trade closed |
| `exit_price` | number | Required if no `outcome` | Close price |
| `entry` | number | Optional | Entry price (for audit) |
| `sl` | number | Optional | SL level at close |
| `tp` | number | Optional | TP level at close |
| `ticket` | number | Optional | Broker ticket |
| `closed_at` | ISO string | Optional | When the trade closed |

If `outcome` is omitted, the server infers TP vs SL by comparing `exit_price` to the setup’s TP and SL.

---

## Sender name format

`sender` must match the name sent to Signal Hub when the setup was submitted:

- Display name with spaces → underscores, non-alphanumeric stripped  
  - `"Platform Admin"` → `Platform_Admin`
- Empty / invalid display name → `trader_<first-8-chars-of-user-id>`

You can read the expected value from the submit response under `execution.sendername`.

---

## Examples

### 1. Trade opened (single event)

```bash
curl -X POST "https://traders-c53s.onrender.com/api/v1/signals/webhook/trades" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: YOUR_SECRET" \
  -d '{
    "event": "opened",
    "sender": "willer_Fx",
    "signalId": "cmqu4o80w0010pi016ddct8hb",
    "symbol": "EURUSD",
    "direction": "buy",
    "entry": 1.0855,
    "sl": 1.0820,
    "tp": 1.0920,
    "ticket": 8841201,
    "opened_at": "2026-06-26T10:15:00.000Z"
  }'
```

**Response:**

```json
{
  "status": "opened",
  "event": "opened",
  "signalId": "cmqu4o80w0010pi016ddct8hb",
  "sender": "willer_Fx",
  "symbol": "EURUSD",
  "direction": "BUY",
  "entry": 1.0855,
  "sl": 1.082,
  "tp": 1.092,
  "ticket": 8841201,
  "tradeState": "in_trade"
}
```

### 2. Trade closed at take profit

```bash
curl -X POST "https://traders-c53s.onrender.com/api/v1/signals/webhook/trades" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: YOUR_SECRET" \
  -d '{
    "event": "closed",
    "sender": "willer_Fx",
    "signalId": "cmqu4o80w0010pi016ddct8hb",
    "symbol": "EURUSD",
    "direction": "buy",
    "entry": 1.0855,
    "sl": 1.0820,
    "tp": 1.0920,
    "outcome": "tp",
    "exit_price": 1.0920,
    "ticket": 8841201,
    "closed_at": "2026-06-26T14:30:00.000Z"
  }'
```

**Response:**

```json
{
  "status": "claimed",
  "source": "webhook",
  "outcome": "tp",
  "signalId": "cmqu4o80w0010pi016ddct8hb",
  "exitPrice": 1.092,
  "reward": 5,
  "pointsAwarded": 15,
  "event": "closed",
  "sender": "willer_Fx",
  "tradeState": "won",
  "closed_at": "2026-06-26T14:30:00.000Z"
}
```

### 3. Trade closed at stop loss

```json
{
  "event": "closed",
  "sender": "willer_Fx",
  "signalId": "cmqu4o80w0010pi016ddct8hb",
  "outcome": "sl",
  "exit_price": 1.0820
}
```

**Response `tradeState`:** `"lost"`

### 4. Batch sync (multiple trades)

```bash
curl -X POST "https://traders-c53s.onrender.com/api/v1/signals/webhook/trades?key=YOUR_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "trades": [
      {
        "event": "opened",
        "sender": "Trader_A",
        "signalId": "abc123",
        "entry": 2650.5,
        "sl": 2640,
        "tp": 2670
      },
      {
        "event": "closed",
        "sender": "Trader_B",
        "signalId": "def456",
        "outcome": "tp",
        "exit_price": 1.092
      }
    ]
  }'
```

**Response:**

```json
{
  "processed": 2,
  "results": [ { "...": "opened result" }, { "...": "closed result" } ]
}
```

---

## Trade states (how the platform uses your data)

| Your webhook | Setup status | Trader sees |
|--------------|--------------|-------------|
| `opened` / `open` | `OPEN`, trade activated | In trade — not claimable until price/Hub says TP/SL |
| (no close yet) | `OPEN` | Still in trade on dashboard |
| `closed` + `tp` | `WON` | TP hit — wallet credited, score updated |
| `closed` + `sl` | `LOST` | SL hit — loss recorded |

Traders can still use **Claim TP** manually (with screenshots) if your webhook never fired; once you send `closed`, the setup is resolved automatically.

---

## Idempotency & errors

| HTTP | Meaning |
|------|---------|
| `200` | Processed (check `status`: `opened`, `claimed`, `ignored`) |
| `401` | Invalid or missing webhook secret |
| `400` | Bad payload (missing `event`, `sender`, or close fields) |
| `404` | No matching setup for `signalId` / `sender` |

If the setup is already resolved, `closed` returns:

```json
{
  "status": "ignored",
  "reason": "already_resolved",
  "signalId": "...",
  "tradeState": "won"
}
```

---

## Legacy outcome-only webhook

Still supported for TP/SL-only notifications:

```
POST /api/v1/signals/webhook/outcome
```

Use the **trades** webhook when you need to report **opens** and full trade context (entry, SL, TP, sender). Use **outcome** for a minimal TP/SL ping with only `signalId` + `outcome`.

---

## Environment

```env
TRADE_OUTCOME_WEBHOOK_SECRET=generate-a-long-random-string
API_PUBLIC_URL=https://traders-c53s.onrender.com
```

Both webhooks share the same secret.
