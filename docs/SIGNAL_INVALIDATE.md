# Invalidate a setup (Signal Hub)

Cancel a **pending** setup so Signal Hub / MT5 will **not** execute it. Use this when the trade idea is no longer valid (e.g. price already moved, limit order should be pulled).

**Archive** (`POST /signals/archive/{signalId}`) only removes the setup from your dashboard locally — it does **not** tell Hub to cancel execution. **Invalidate** does both: Hub cancel + platform status `CANCELLED`.

---

## TraderRank API

```
POST /api/v1/signals/invalidate/{signalId}
```

**Auth:** Bearer JWT (active trader)

**Body (optional):**

```json
{
  "reason": "Price already hit my zone — limit no longer valid"
}
```

| Field | Type | Max | Description |
|-------|------|-----|-------------|
| `reason` | string | 500 | Shown to Signal Hub / Quantum; stored on rejected TP claims if any |

**Response:**

```json
{
  "status": "cancelled",
  "signalId": "cmqu4o80w0010pi016ddct8hb",
  "hub": {
    "id": "5395e158-9fca-4ecc-b4b4-48da90f89810",
    "status": "invalidated",
    "ok": true,
    "progress": {
      "stage": "invalidated",
      "message": "Signal invalidated by provider",
      "executed": false
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `hub` | Signal Hub response when `SIGNAL_HUB_PROVIDER_KEY` is configured |
| `hubWarning` | Present if Hub call failed but platform still marked setup `CANCELLED` |

**Errors:**

| HTTP | When |
|------|------|
| `404` | Setup not found or not `OPEN` |
| `403` | Account not active |

---

## Signal Hub API (proxied internally)

TraderRank calls Hub on your behalf using the trader's `sendername` and your platform `signalId` as `external_id`.

```
POST /v1/signals/external/{external_id}/invalidate?sendername={sendername}
```

**Header:** `x-provider-key: <SIGNAL_HUB_PROVIDER_KEY>`

**Body (optional):**

```json
{
  "reason": "Why the setup is no longer valid"
}
```

**Hub response schema (`InvalidateOut`):**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Hub signal UUID |
| `status` | string | e.g. `invalidated` |
| `ok` | boolean | Default `true` |
| `progress` | object | `stage`, `message`, `executed` |
| `duplicate` | boolean | Re-invalidation of same signal |

Alternative: `POST /v1/signals/{signal_id}/invalidate` when you have the Hub UUID instead of `external_id`.

---

## Platform effects

1. Signal status → **`CANCELLED`** (not scored, not claimable)
2. Trade row `closedAt` set if present
3. Pending **TP claims** for this setup → **rejected** with your reason
4. Hub pending queue → invalidation event for Quantum to ack

---

## When to use

| Action | Hub cancel | Platform status | Score/wallet |
|--------|------------|-----------------|--------------|
| **Invalidate** | Yes | `CANCELLED` | No change |
| **Archive** | No | `ARCHIVED` | No change |
| **Claim TP/SL** | N/A | `WON` / `LOST` | Yes |

---

## Example (curl)

```bash
curl -X POST "https://traders-c53s.onrender.com/api/v1/signals/invalidate/YOUR_SIGNAL_ID" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Setup expired — price moved away"}'
```
