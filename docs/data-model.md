# Data model

> **Important:** the live API returns **PascalCase** keys (`FixtureId`, `Score`, `Prices`).
> The official docs' OpenAPI examples show lowercase camelCase (`fixtureId`, `scoreSoccer`) —
> those don't match reality. This page documents the **actual** response shapes, with live samples
> captured from the free World Cup tier. See [gotchas.md](./gotchas.md#casing).

All endpoints return JSON arrays.

---

## Fixtures — `GET /api/fixtures/snapshot`

| Field | Type | Meaning |
|-------|------|---------|
| `FixtureId` | int64 | Stable fixture id (use as `{fixtureId}` path param elsewhere) |
| `Competition` / `CompetitionId` | string / int32 | e.g. `World Cup` / `72`, `Friendlies` / `430` |
| `Participant1` / `Participant1Id` | string / int32 | Home side (when `Participant1IsHome`) |
| `Participant2` / `Participant2Id` | string / int32 | Away side |
| `FixtureGroupId` | int32 | Groups related fixtures (e.g. same match) |
| `StartTime` | int64 (ms) | Kickoff time |
| `Ts` | int64 (ms) | Snapshot timestamp |
| `Participant1IsHome` | bool | If false, participant 2 is home |
| `GameState` | int | *(optional)* pre-match phase code, e.g. `1` = NS |

**Live sample** (World Cup):

```json
{
  "Ts": 1783076400000,
  "StartTime": 1783128600000,
  "Competition": "World Cup",
  "CompetitionId": 72,
  "FixtureGroupId": 10115677,
  "Participant1Id": 1748, "Participant1": "Colombia",
  "Participant2Id": 2043, "Participant2": "Ghana",
  "FixtureId": 18179549,
  "Participant1IsHome": true
}
```

---

## Odds — `GET /api/odds/snapshot/{fixtureId}`

One entry per unique market line (bookmaker × market × period × params).

| Field | Type | Meaning |
|-------|------|---------|
| `Bookmaker` / `BookmakerId` | string / int32 | Source. Free tier: `TXLineStablePriceDemargined` / `10021` |
| `SuperOddsType` | string | Market, e.g. `1X2_PARTICIPANT_RESULT`, `ASIANHANDICAP_PARTICIPANT_GOALS` |
| `MarketPeriod` | string? | `null` = full match; `"half=1"` = first half |
| `MarketParameters` | string? | e.g. `"line=0"`, `"line=-0.25"`, `"line=0.25"` (Asian handicap line) |
| `PriceNames` | string[] | Leg labels: `["part1","draw","part2"]` (1X2) or `["part1","part2"]` (AH) |
| `Prices` | int32[] | **×1000 fixed-point** → divide by 1000 for decimal odds |
| `Pct` | string[] | Implied probability %, 3 decimals, or `"NA"` for quarter-ball handicaps |
| `InRunning` | bool | Live (in-play) vs pre-match |
| `GameState` | string? | null when pre-match |
| `MessageId` | string | Internal message id (bookmaker batch source) |
| `Ts` | int64 (ms) | Odds timestamp |

**Reading prices:** `Prices:[6315, 2247, 2526]` → decimal odds **6.32 / 2.25 / 2.53**;
`Pct:["15.835","44.583","39.588"]` → implied 15.8% / 44.6% / 39.6% (overround included).

**Live sample** (World Cup, Canada vs Morocco):

```json
{
  "FixtureId": 18185036,
  "MessageId": "1836258068:00003:000582-10021-stab",
  "Ts": 1783153275739,
  "Bookmaker": "TXLineStablePriceDemargined",
  "BookmakerId": 10021,
  "SuperOddsType": "1X2_PARTICIPANT_RESULT",
  "MarketPeriod": "half=1",
  "MarketParameters": null,
  "InRunning": false,
  "GameState": null,
  "PriceNames": ["part1", "draw", "part2"],
  "Prices": [6315, 2247, 2526],
  "Pct": ["15.748", "44.504", "39.746"]
}
```

Observed market types on the free tier: `1X2_PARTICIPANT_RESULT` (match/half result) and
`ASIANHANDICAP_PARTICIPANT_GOALS` (Asian handicap, `MarketParameters=line=<value>`).

---

## Scores — `GET /api/scores/snapshot/{fixtureId}`

One entry per score event; the **last** entry is the current state. The soccer data lives under
top-level `Score`, `Data`, `Stats` (there is no `scoreSoccer` field).

| Field | Type | Meaning |
|-------|------|---------|
| `GameState` | string | Lowercase phase, e.g. `"scheduled"` (pre-match). Live values confirmed by re-querying during a match |
| `Type` | string | Sport, e.g. `"Soccer"` |
| `StatusId` | int | Phase/status code |
| `Action` | string | Last event type, e.g. `"yellow_card"`, `"action_amend"` |
| `Id` / `Seq` / `Ts` / `ConnectionId` | int | Event identity + ordering |
| `Clock` | `{ Running, Seconds }` | Match clock (seconds elapsed) |
| `Score` | object | Per-half totals — see below |
| `Data` | object | Last action detail (player, outcome, clock) |
| `Stats` | object | Encoded stat totals — see below |
| `Participant` / `Possession` / `PossessionType` | int / int / string | Possession info |
| `CoverageType` / `CoverageSecondaryData` | string / bool | Coverage level (e.g. `TV/Stream`) |
| `lineups` | array | *(when present)* player lineups |

**`Score` structure** — `Participant1` / `Participant2`, each with period buckets
`H1`, `HT`, `H2`, `ET1`, `ET2`, `PE`, `Total`; each bucket has any of
`Goals`, `YellowCards`, `RedCards`, `Corners`. Absent stats are omitted (treat as 0).

**Live sample** (World Cup, Colombia vs Ghana, in-play):

```json
{
  "FixtureId": 18179549,
  "GameState": "scheduled",
  "Type": "Soccer",
  "StatusId": 4,
  "Action": "yellow_card",
  "Seq": 797,
  "Clock": { "Running": true, "Seconds": 4649 },
  "CoverageType": "TV/Stream",
  "Score": {
    "Participant1": {
      "H1":    { "Goals": 1, "YellowCards": 1, "Corners": 1 },
      "Total": { "Goals": 1, "YellowCards": 2, "Corners": 2 }
    },
    "Participant2": {
      "H2":    { "YellowCards": 3 },
      "Total": { "YellowCards": 3, "Corners": 2 }
    }
  }
}
```

Reads as: **Colombia 1 – 0 Ghana**; P1 2 yellows / 2 corners, P2 3 yellows / 2 corners.

### `Stats` — on-chain encoding

`Stats` is a flat map keyed by `(period * 1000) + base_key`, matching the soccer-feed spec.
This is the form used for on-chain validation/settlement.

**Base keys (totals):**

| Key | Stat |
|-----|------|
| `1` | Participant 1 goals |
| `2` | Participant 2 goals |
| `3` | Participant 1 yellow cards |
| `4` | Participant 2 yellow cards |
| `5` | Participant 1 red cards |
| `6` | Participant 2 red cards |
| `7` | Participant 1 corners |
| `8` | Participant 2 corners |

**Period multipliers:** `+0` total, `+1000` H1, `+2000` H2, `+3000` ET1, `+4000` ET2, `+5000` PE.
Example: `1001` = P1 first-half goals; `2008` = P2 second-half corners.

**Live sample:**

```json
{
  "1": 1, "2": 0, "3": 2, "4": 3, "5": 0, "6": 0, "7": 2, "8": 2,
  "1001": 1, "1003": 1, "1007": 1, "1008": 2,
  "2001": 1, "2003": 1, "2007": 1, "2008": 2,
  "3003": 1, "3004": 3, "3007": 1
}
```

Decoded totals → **P1: 1G 2Y 0R 2C | P2: 0G 3Y 0R 2C** (ET1 holds the H2-time yellows here).

### Game phases

On-chain phase codes (used in settlement; the REST `GameState` is a human-readable string):

`NS`(1) H1(2) HT(3) H2(4) F(5) WET(6) ET1(7) HTET(8) ET2(9) FET(10) WPE(11) PE(12) FPE(13)
I(14) A(15) C(16) TXCC(17) TXCS(18) P(19) — not started, halves, halftime, finished, extra time,
penalties, interrupted/abandoned/cancelled, coverage suspended, postponed.
