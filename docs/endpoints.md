# Endpoint reference

Base URL: `https://txline.txodds.com` (mainnet) or `https://txline-dev.txodds.com` (devnet).
Use the host root for `/auth/...` and `/api/...` for everything else.

**Auth** — every `/api/...` data request requires both headers:

```
Authorization: Bearer <jwt>      # guest session JWT from /auth/guest/start
X-Api-Token:   <apiToken>        # long-lived token from /api/token/activate
```

See [connect.md](./connect.md) for obtaining them.

**Status codes** — all data endpoints return `200` (ok), `400` (bad params), `401` (bad/missing
JWT), `403` (bad/missing/expired API token or no active subscription), `500` (server error).

Paths marked ✅ below are confirmed by live calls in [`probe.mjs`](../probe.mjs) and the official
examples. Others follow the documented endpoint titles — verify against the API Reference if you
use them.

## Authentication

| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/auth/guest/start` ✅ | — | `{ token }` guest JWT |
| POST | `/api/token/activate` ✅ | `{ txSig, walletSignature, leagues: [] }` | `{ token }` API token |

## Purchase (paid tiers only — not used by free World Cup tier)

| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/api/guest/purchase/quote` | `{ buyerPubkey, txlineAmount }` | partially-signed USDT→TxL purchase tx |

## Fixtures

| Method | Path | Params | Returns |
|--------|------|--------|---------|
| GET | `/api/fixtures/snapshot` ✅ | `?startEpochDay=` (day, within +30d), `?competitionId=` | array of fixtures |
| GET | `/api/fixtures/updates/{fixtureId}/{epochDay}` | — | all updates for one fixture on a day |
| GET | `/api/fixtures/proof/{...}` | — | Merkle proof for a specific fixture update |
| GET | `/api/fixtures/batch-proof/{...}` | — | Merkle proof for an entire hourly batch |

## Odds (StablePrice consensus)

| Method | Path | Params | Returns |
|--------|------|--------|---------|
| GET | `/api/odds/snapshot/{fixtureId}` ✅ | `?asOf=<ms>` (historical; omit = current 5-min live snapshot) | array of odds per market line |
| GET | `/api/odds/updates/{fixtureId}` | — | currently-live odds updates for one fixture |
| GET | `/api/odds/updates/{epochDay}/{hour}/{interval}` ✅ | path = day / hour / 5-min interval (0–11) | all odds updates in a historical 5-min interval |
| GET | `/api/odds/stream` | SSE (`Accept: text/event-stream`) | real-time odds stream |
| GET | `/api/odds/proof/{...}` | — | Merkle proof for a specific odds update |

## Scores (soccer block)

| Method | Path | Params | Returns |
|--------|------|--------|---------|
| GET | `/api/scores/snapshot/{fixtureId}` ✅ | `?asOf=<ms>` (historical; omit = live) | array of score events / latest state |
| GET | `/api/scores/updates/{fixtureId}` ✅ | — | score updates in the **current** 5-min interval |
| GET | `/api/scores/updates/{epochDay}/{hour}/{interval}` ✅ | path = day / hour / 5-min interval | historical 5-min interval (**no live data**) |
| GET | `/api/scores/historical/{fixtureId}` | — | full score-event sequence (fixture started 2w–6h ago) |
| GET | `/api/scores/stream` | SSE (`Accept: text/event-stream`) | real-time score stream |
| GET | `/api/scores/proof/{...}` | — | Merkle proof for fixture statistics |

## Notes

- `epochDay` = days since Unix epoch (UTC). `hour` = 0–23 UTC. `interval` = 0–11 (the 5-min slot
  within the hour).
- All responses are JSON arrays. Field casing is **PascalCase** — see [data-model.md](./data-model.md).
- Merkle-proof endpoints feed the on-chain `validate_*` instructions; not needed for plain data reads.
