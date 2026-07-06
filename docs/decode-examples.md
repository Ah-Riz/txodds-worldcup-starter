# Decode examples — the arithmetic

Every number in `probe.mjs`'s output comes from two non-obvious encodings. Walked here step by
step on **real captured data** from [`../samples/demo.json`](../samples/demo.json). Run
`node lib/decode.mjs` to see the exact decoders execute.

## 1. Prices → decimal odds

Odds come as **×1000 fixed-point integers** (avoids floats on the wire):

```
USA vs Belgium — 1X2 (win / draw / win)
PriceNames : ["part1", "draw", "part2"]
Prices     : [2769, 3610, 2763]
```

Divide each by 1000:

```
2769 / 1000 = 2.77   ← USA win
3610 / 1000 = 3.61   ← draw
2763 / 1000 = 2.76   ← Belgium win
```

(2.77 means a $1 stake returns $2.77 — i.e. $1.77 profit.)

## 2. Pct → implied probability (and why it's "true")

`Pct` is the implied probability %, as a string with 3 decimals:

```
Pct : ["36.114", "27.701", "36.193"]   →   36.1% / 27.7% / 36.2%
```

Here's the key part — **add them up**:

```
36.114 + 27.701 + 36.193 = 100.008%
```

A normal bookmaker's implied probabilities sum to ~105% — that extra ~5% is the *overround*, the
bookie's built-in margin. This feed's bookmaker is `TXLineStablePriceDemargined`: the margin is
**removed**, so the probabilities sum to ~100%. That means `Pct` here is **fair value**, not a
taxed price — the genuine consensus probability. This is the single biggest reason the data is
interesting, and it's concretely visible in every 1X2 line.

(Asian handicap `line=0` does the same: `["50.302", "49.677"]` → 50.3% + 49.7% = 100.0%.)

### "NA" — quarter-ball handicaps & over/under

Asian handicaps on quarter-ball lines (`line=-0.25`, `line=0.25`) and over/under lines don't get a
single implied % — the bet splits — so `Pct` is `"NA"`:

```
ASIANHANDICAP line=-0.25:  Prices [2397, 1716]  Pct ["NA", "NA"]
                           → decimal 2.40 / 1.72  (price still decodes; probability doesn't)
```

## 3. Stats → per-half goals / cards / corners

`Stats` is one flat map. Each key is **`(period * 1000) + baseKey`**:

- **period**: `0` = total, `1` = H1, `2` = H2, `3` = ET1, `4` = ET2, `5` = PE
- **baseKey**: `1/2` = P1/P2 goals, `3/4` = yellow cards, `5/6` = red cards, `7/8` = corners

Real captured totals from Mexico vs England:

```
"1": 2, "2": 3, "3": 2, "4": 4, "5": 0, "6": 1, "7": 10, "8": 2
```

Decode each key:

| key | period | baseKey | meaning | value |
|-----|--------|---------|---------|-------|
| `1` | 0 (total) | 1 | P1 goals | **2** |
| `2` | 0 | 2 | P2 goals | **3** |
| `3` | 0 | 3 | P1 yellow | **2** |
| `4` | 0 | 4 | P2 yellow | **4** |
| `5` | 0 | 5 | P1 red | 0 |
| `6` | 0 | 6 | P2 red | **1** |
| `7` | 0 | 7 | P1 corners | **10** |
| `8` | 0 | 8 | P2 corners | **2** |

→ **Mexico 2 – 3 England**. Mexico: 2 yellow, 10 corners. England: 4 yellow, 1 red, 2 corners.

Now the per-period keys (the thousands digit is the period):

```
"1001": 1   →  period 1 (H1),  baseKey 1 → P1 first-half goals  = 1
"1002": 2   →  H1,  baseKey 2 → P2 first-half goals  = 2
"1007": 4   →  H1,  baseKey 7 → P1 first-half corners = 4
"1008": 2   →  H1,  baseKey 8 → P2 first-half corners = 2
"2001": 1   →  period 2 (H2), baseKey 1 → P1 second-half goals = 1
"3003": 2   →  period 3 (ET1), baseKey 3 → P1 extra-time yellow = 2
"3006": 1   →  ET1, baseKey 6 → P2 extra-time red = 1
```

This is what makes the data **composable**: the same flat map answers "total corners", "first-half
corners", "second-half yellow cards" — any stat in any period. That's what lets a market settle
"H1 corners > 3" trustlessly from the on-chain encoding.

## Run it

```bash
node lib/decode.mjs                       # the decoders + a self-check on a known sample
node probe.mjs --from-samples --explain   # see them applied to samples/demo.json
```

Field reference: [data-model.md](./data-model.md). Decoder source: [`../lib/decode.mjs`](../lib/decode.mjs).
