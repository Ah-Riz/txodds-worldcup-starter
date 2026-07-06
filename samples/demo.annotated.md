# demo.json — annotated

A tour of [`demo.json`](./demo.json) (real captured World Cup data), field by field. JSON can't
hold comments, so this is the annotated view. Full field reference:
[../docs/data-model.md](../docs/data-model.md). Decode arithmetic:
[../docs/decode-examples.md](../docs/decode-examples.md).

## A fixture (the match list)

```json
{
  "FixtureId": 18192996,           // stable id; used as the {fixtureId} path param for odds/scores
  "Competition": "World Cup",      // free tier = World Cup + International Friendlies only
  "CompetitionId": 72,
  "Participant1": "Mexico",        // Participant1 is the "home" side here ↓
  "Participant2": "England",
  "Participant1IsHome": true,      // if false, swap: Participant2 is home
  "StartTime": 1783299600000,      // kickoff, ms since epoch
  "FixtureGroupId": 10115574,      // groups related fixtures (e.g. same match, diff markets)
  "GameState": 1                   // optional pre-match phase code (1 = not started)
}
```

## An odds entry (one per market line)

```json
{
  "FixtureId": 18193785,
  "Bookmaker": "TXLineStablePriceDemargined",   // free-tier source — de-marginized (fair value)
  "BookmakerId": 10021,
  "SuperOddsType": "1X2_PARTICIPANT_RESULT",    // the market: 1X2 = win/draw/win
  "MarketPeriod": null,                         // null = full match; "half=1" = first half
  "MarketParameters": null,                     // e.g. "line=0", "line=-0.25" (Asian handicap)
  "PriceNames": ["part1", "draw", "part2"],     // leg labels (2 for AH; "over"/"under" for O/U)
  "Prices": [2769, 3610, 2763],                 // ×1000 fixed-point → ÷1000 = 2.77 / 3.61 / 2.76
  "Pct": ["36.114", "27.701", "36.193"],        // implied prob % (sums to ~100% → de-marginized)
  "InRunning": false,                           // live in-play vs pre-match
  "GameState": null,                            // null when pre-match
  "Ts": 1783307244607                           // odds timestamp (ms)
}
```

## A score entry (the last entry = current state)

```json
{
  "FixtureId": 18192996,
  "GameState": "scheduled",                     // human-readable phase (vs the int code on fixtures)
  "Action": "yellow_card",                      // what this event was
  "Seq": 994,                                   // event ordering — highest Seq = newest
  "Type": "Soccer",
  "Clock": { "Running": true, "Seconds": 5924 },// live match clock
  "CoverageType": "TV/Stream",
  "Score": { /* per-half totals — see below */ },
  "Data":   { /* last action detail: player, outcome, clock */ },
  "Stats":  { "1": 2, "2": 3, "1001": 1, ... }  // encoded map: key = (period*1000)+baseKey
}
```

**`Score`** is the human-readable per-half breakdown:

```
Participant1 (Mexico):   H1{Goals:1,Corners:4}  H2{Goals:1,YellowCards:2,Corners:6}  Total{Goals:2,YellowCards:2,Corners:10}
Participant2 (England):  H1{Goals:2,YellowCards:1,Corners:2}  H2{Goals:1,YellowCards:3,RedCards:1}  Total{Goals:3,YellowCards:4,RedCards:1,Corners:2}
```

**`Stats`** is the on-chain-friendly flat map — the same numbers, machine-encoded as
`(period*1000)+baseKey`. Decode it with `node lib/decode.mjs`, or by hand in
[decode-examples.md](../docs/decode-examples.md) §3.
