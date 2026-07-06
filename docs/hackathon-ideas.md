# Hackathon build ideas — World Cup × TxODDS

Ideas menu for the **24-Hour World Cup Hackathon, Indonesia Edition** (Superteam IDN × TxODDS).
One doc you can hand to a teammate or student: what to build per track, the data to use, and
**how to build each one** (concept level).

> **Event:** 15–16 July 2026 · **Submissions close:** 19 July · **Pool:** $50,000
> **TxLINE data is free for the whole competition.** Free tier covers **World Cup + International
> Friendlies** (level `1` = 60s delay, level `12` = real-time, mainnet only).

Tracks:
1. Prediction Markets & Settlement — **$18K**
2. Trading Tools & Agents — **$16K**
3. Consumer & Fan Experience — **$16K**

---

## Why TXODDS is not just another sports API

Three things most sports APIs do **not** give you. These are your edge:

1. **True (de-marginized) odds.** The `TXLineStablePriceDemargined` bookmaker removes the bookie
   margin, so the `Pct[]` field is the *real* implied probability — fair value, not a taxed price.
2. **Trustless on-chain settlement.** The Solana program ships the full loop:
   `create_intent` → `execute_match` → `settle_trade` / `settle_matched_trade`, resolved by score
   **Merkle proofs**. Bets settle with no manual oracle and no dispute team.
3. **Rich live soccer stats + composable outcomes.** Per-half goals/cards/corners, lineups,
   possession, VAR, live clock — and an on-chain `Stats` encoding `(period*1000)+key` that lets a
   market target **any** stat in **any** period (e.g. "P1 first-half corners > 3").

### Data → task map

| You want to… | Use |
|---|---|
| List matches | `GET /api/fixtures/snapshot` |
| Read "true" odds | `GET /api/odds/snapshot/{fixtureId}` → `Prices` (÷1000) + `Pct` |
| Read live stats | `GET /api/scores/snapshot/{fixtureId}` → `Score`, `Data`, `Stats` |
| Stream in-play | `GET /api/odds/stream`, `GET /api/scores/stream` (SSE) |
| Settle a bet on-chain | `settle_trade` / `settle_matched_trade` + a Merkle proof |
| Validate any data point | `validate_stat` / `validate_fixture` / `validate_odds` |

Field reference + live samples: [data-model.md](./data-model.md). Endpoints: [endpoints.md](./endpoints.md).
Connect/auth: [connect.md](./connect.md).

### Anatomy of every build (read this once)

Every project here is the same four-stage pipeline — build it once, reuse for any idea:

```
 1 AUTH            2 INGEST              3 TRANSFORM              4 ACT
 setup.mjs    -->  poll snapshot    -->  parse PascalCase    -->  display (T3)
 (JWT+token)       or subscribe SSE       Prices/1000              alert/trade (T2)
                                          Pct = implied %          settle on-chain (T1)
                                          Stats(period*1000)+key
```

- **Auth** — run `node setup.mjs` once → `JWT` + `API_TOKEN` in `.env`. Copy `probe.mjs` as your
  ingest+transform layer; it already does stages 2–3 correctly.
- **Ingest** — snapshot endpoints for batch, `*/stream` (SSE) for live.
- **Transform** — `Prices` ÷ 1000 = decimal odds; `Pct` = implied probability; `Stats` keys decode
  via `(period*1000)+base_key` (see [data-model.md](./data-model.md)).
- **Act** — Track 3 renders it, Track 2 alerts/trades on it, Track 1 settles it on-chain.

Each guide below uses this template:

> **How to build** — Architecture (ASCII) · Data flow · Key calls · Stack · MVP → stretch

---

## Track 1 — Prediction Markets & Settlement · $18K

*The only track where TXODDS' real moat (oracle **and** settlement) shows up. Strongest play.*

### 1.1 World Cup Stat Markets *(Hard · flagship)*
P2P prediction market where anyone posts/takes a bet on **any** stat — not just 1X2: "P1 corners
> 5", "H1 cards < 3", Asian handicaps per half. Settles trustlessly from score Merkle proofs.
- **Uses:** `create_intent`, `execute_match`, `settle_trade`, `validate_stat` + free fixtures/odds/scores.
- **Edge:** composable `MarketIntentParams` (stat keys + predicate + op) = markets no bookie offers.

**How to build**
```
 [React dApp] --post intent--> [Node API] --create_intent--> [Solana program]
      |                            |                              |
   order book                odds/scores poll            matched_trade (PDA)
      |                            |                              |
   "my bets"                GET /scores/proof  <-- settle_trade --+ (winner paid)
```
- **Data flow:** maker picks fixture + stat predicate (e.g. `stat_a_key=7` corners, `period=1` H1,
  `predicate threshold=5`, `comparison=GreaterThan`) → hash to `terms_hash` →
  `create_intent(deposit in TxL)` → taker `execute_match` → on match end, keeper fetches the score
  Merkle proof → `settle_trade` → contract credits the winner.
- **Key calls:** `fixtures/snapshot`, `scores/snapshot`, `/scores/proof`; `create_intent`,
  `execute_match`, `settle_trade`, `validate_stat`.
- **Stack:** Next.js + `@solana/wallet-adapter` + Anchor (IDL in `lib/idl/`); wallet holds TxL.
- **MVP → stretch:** MVP = one market type (1X2) listed + trustlessly settled. Stretch = arbitrary
  stat/period predicates, live in-play markets, on-chain order book UI.

### 1.2 Auto-Settler / Oracle Keeper *(Med)*
A bot that watches matched trades, fetches the matching Merkle proof, and calls `settle_*`
automatically. Infrastructure the whole ecosystem needs.
- **Uses:** `settle_matched_trade` + `/api/scores/proof/{...}`.
- **Edge:** proves the settlement system end-to-end; genuinely useful to other builders.

**How to build**
```
 [Cron / poller (Node)]
      |-- getProgramAccounts(MatchedTrade, state=active) --> unsettled trades
      |-- for each: is fixture finished? (scores/snapshot GameState)
      |-- GET /api/scores/proof/{fixtureId}/{...}  --> Merkle proof
      +-- settle_matched_trade(tradeId, ts, summary, proofs, statA/B, terms)
 [Status dashboard]  (optional)
```
- **Data flow:** poll the program for `MatchedTrade` accounts not yet `resolved` → for each, check
  the fixture finished → pull the proof → submit `settle_matched_trade` → mark done.
- **Key calls:** `getProgramAccounts(MatchedTrade)`; `scores/snapshot`, `scores/proof`;
  `settle_matched_trade`.
- **Stack:** Node service + Anchor (read+write); tiny status page optional.
- **MVP → stretch:** MVP = settles one trade type on a finished match. Stretch = all trade types,
  retry queue, gas-aware, alerts.

### 1.3 Parlay / Accumulator wrapper *(Med)*
Combine several stat predicates into one bet ("P1 win **AND** total corners > 7") using the
program's multi-stat `op` (Add/Subtract).
- **Edge:** productizes a feature bettors already love, on a trustless rail.

**How to build**
```
 [Parlay builder UI] -- pick N legs --> each leg = MarketIntentParams
      |-- (a) N linked create_intent, or (b) one wrapper that bundles them
      +-- settle each leg (settle_trade) --> all-win? parlay pays, else lose
```
- **Data flow:** user selects legs → build a `MarketIntentParams` per leg (use `op` Add/Subtract to
  combine stats within a leg) → create/match intents → after match, settle every leg → aggregate.
- **Key calls:** `create_intent` ×N, `settle_trade` ×N; `MarketIntentParams.op`.
- **Stack:** frontend + Anchor.
- **MVP → stretch:** MVP = 2-leg parlay, manual settle. Stretch = N legs, auto-settle, partial
  cash-out.

### 1.4 Audit Explorer *(Easy)*
A UI that lets anyone verify any settled trade on-chain via `audit_trade_result` — a transparency
and credibility tool.
- **Edge:** trust narrative; demos cleanly to judges.

**How to build**
```
 [Web UI] -- enter trade/tx id --> load MatchedTrade account
      |-- fetch the proof the settler used
      +-- audit_trade_result(...) client-side --> show VERIFIED ✓ / ✗ + proof path
```
- **Data flow:** enter a trade id → `getAccountInfo(MatchedTrade)` → pull its proof → re-run
  `audit_trade_result` read-only → render verdict + the Merkle path.
- **Key calls:** `getAccountInfo`; `audit_trade_result`, `validate_stat`.
- **Stack:** Next.js + Anchor read-only (no wallet needed to audit).
- **MVP → stretch:** MVP = lookup + pass/fail. Stretch = history feed, per-leg breakdown, graphs.

---

## Track 2 — Trading Tools & Agents · $16K

*Uses the de-marginized odds + live streams. Light on-chain, heavy on data/agent logic.*

### 2.1 True-Odds Value Finder *(Med · flagship)*
Turn `Pct[]` into "fair %" and flag value versus a simple model (or versus a Track-1 order book).
Dashboard of live edges.
- **Uses:** `odds/snapshot`, `odds/stream`, optionally `create_intent` to auto-post.
- **Edge:** exposes consensus fair value no bookmaker shows.

**How to build**
```
 [Poller / SSE] -- odds/snapshot --> Pct[] (true implied %)
      |-- model probability (e.g. Poisson from goals, or your own)
      |-- edge = modelProb - impliedPct
      +-- rank edges --> [dashboard]  --> (optional) create_intent at value
```
- **Data flow:** poll `odds/snapshot` → `Pct` is already de-marginized → compare to your model prob
  → positive edge = value bet → show sorted; optionally auto-post a `create_intent`.
- **Key calls:** `odds/snapshot`, `odds/stream`; optional `create_intent`.
- **Stack:** Node + simple web dashboard; optional LLM for narrative on each edge.
- **MVP → stretch:** MVP = 1X2 value table from `Pct`. Stretch = live streaming, multi-market,
  auto-trade with risk caps.

### 2.2 Live Market-Making Bot *(Hard)*
Post both sides of a market around the consensus price; manage risk with the live score stream and
auto-cancel on goals/cards.
- **Uses:** `odds/stream` + `scores/stream` + `create_intent` / `close_intent`.
- **Edge:** end-to-end autonomous trading agent.

**How to build**
```
 [odds/stream + scores/stream] --> fair price from Pct
      |-- quote maker intents above (sell) / below (buy) fair
      |-- on goal/card/red --> close_intent + requote
      +-- risk gate (max exposure, one side only)
```
- **Data flow:** subscribe both streams → recompute fair price from `Pct` → place a buy and a sell
  `create_intent` around it → on any score event, `close_intent` and requote.
- **Key calls:** `odds/stream`, `scores/stream`, `create_intent`, `close_intent`.
- **Stack:** Node service + Anchor; funded wallet (TxL).
- **MVP → stretch:** MVP = one-sided quoting on 1X2. Stretch = two-sided, multi-market, inventory
  limits, kill-switch.

### 2.3 Odds-Movement / Steam Tracker *(Easy)*
Visualize how true probability moves from pre-match into in-play; surface sharp moves.
- **Uses:** historical `odds/updates/{epochDay}/{hour}/{interval}` + live stream.
- **Edge:** clean visual story, fast to ship.

**How to build**
```
 [historical odds/updates/{d}/{h}/{i}] + [odds/stream] --> Pct time series
      |-- chart implied % over time
      +-- flag big deltas ("steam moves")
```
- **Data flow:** pull historical `odds/updates/...` for the day, append live `odds/stream` ticks →
  build a `Pct` time series per outcome → chart + annotate moves.
- **Key calls:** `odds/updates/{epochDay}/{hour}/{interval}`, `odds/stream`.
- **Stack:** Node + a chart lib (e.g. `lightweight-charts`) + static host.
- **MVP → stretch:** MVP = pre-match → in-play probability chart for one match. Stretch = alerts on
  moves, per-market overlays.

### 2.4 Cross-Market Arb Scanner *(Med)*
Each fixture returns many markets (1X2 + Asian handicaps at several lines). Scan for internal
inconsistencies where implied probabilities don't reconcile → near-risk-free edges.
- **Edge:** real, computable arbitrage from a single feed.

**How to build**
```
 [odds/snapshot per fixture] --> all market lines
      |-- reconcile: 1/Pct summed vs AH line no-vig boundaries
      |-- if implied sets overlap (negative margin) --> ARB
      +-- alert (Telegram/Discord)
```
- **Data flow:** fetch all odds lines for a fixture → check whether the 1X2 implied set and the
  Asian-handicap lines are mutually consistent → flag any negative-margin (arbitrage) combination.
- **Key calls:** `odds/snapshot`.
- **Stack:** Node cron + notifier (Telegram/Discord bot).
- **MVP → stretch:** MVP = detect 1X2 vs AH-0 inconsistency. Stretch = full line scan across all
  fixtures, auto-execution via the program.

---

## Track 3 — Consumer & Fan Experience · $16K

*Uses scores + odds + SSE. No wallets required — lowest friction, biggest audience, fastest ship.*

### 3.1 Live Win-Probability Companion *(Med · flagship)*
Real-time match view: live scores, per-half goals/cards/corners, lineups, and a **win-probability
bar** derived from live odds — refreshing every 5 min and in-play via SSE.
- **Uses:** `scores/snapshot` + `scores/stream`, `odds/snapshot`, `fixtures/snapshot`.
- **Edge:** richest free soccer data → instant "who's actually winning."

**How to build**
```
 [Next.js app]
   |-- fixtures/snapshot --> match list
   |-- select match --> odds/snapshot --> Pct(part1/draw/part2) --> win-prob bar
   +-- scores/stream --> live goals/cards/corners, lineups, clock
```
- **Data flow:** list matches → on select, fetch `odds/snapshot` and map `Pct` to a win-prob bar →
  subscribe `scores/stream` to update the scoreline + per-half stats live.
- **Key calls:** `fixtures/snapshot`, `odds/snapshot`, `scores/snapshot`, `scores/stream`.
- **Stack:** Next.js + SSE client (built-in `fetch` streaming). **No wallet.**
- **MVP → stretch:** MVP = one match, win-prob + score. Stretch = all WC matches, momentum graph,
  lineups, push alerts.

### 3.2 Social Pick'em (play-money) *(Med)*
Free picks on World Cup stats with a leaderboard and bragging rights — onboards non-crypto fans on
the same data, with an optional path to real stakes later.
- **Edge:** consumer funnel; perfect for the watch party.

**How to build**
```
 [Web/mobile] -- user picks --> [DB (Supabase/SQLite)]
                                   |-- after match: scores/snapshot resolves outcomes
                                   +-- leaderboard updates
```
- **Data flow:** user makes play-money picks → store off-chain → when the match ends, pull
  `scores/snapshot` to grade each pick → update points + leaderboard.
- **Key calls:** `fixtures/snapshot`, `scores/snapshot` (grading).
- **Stack:** Next.js + a DB. **No wallet** for play-money.
- **MVP → stretch:** MVP = pick 1X2 + global leaderboard. Stretch = stat picks, friend leagues,
  optional on-chain stakes via Track-1 program.

### 3.3 Smart Match Alerts *(Easy)*
Push notifications when it matters: "corner count crossed your target", "red card", "odds spike".
Configurable thresholds.
- **Uses:** `scores/stream`.
- **Edge:** dead simple, high perceived value.

**How to build**
```
 [scores/stream consumer] --> event stream
      |-- match events to user rules (corner count, card, goal, odds delta)
      +-- push (web-push / Telegram)
```
- **Data flow:** subscribe `scores/stream` → for each event, check registered rules → fire a push
  notification on match.
- **Key calls:** `scores/stream` (and `odds/stream` for odds-based rules).
- **Stack:** Node service + web-push or a Telegram bot.
- **MVP → stretch:** MVP = corner/card/goal alerts for one match. Stretch = configurable
  thresholds, all matches, odds-spike alerts.

### 3.4 Stat Storyteller / Auto-Recap *(Med)*
Auto-generate a match narrative from the rich score events — scorer, minute, momentum swings —
great for social sharing.
- **Uses:** the `Data` action stream + `Score`/`Stats`.
- **Edge:** uses the action data creatively; very shareable.

**How to build**
```
 [scores/historical/{id} + scores/snapshot] --> ordered events (goal/card/corner + minute)
      |-- structure: timeline + stats totals
      +-- LLM --> readable recap --> shareable card
```
- **Data flow:** after a match, pull `scores/historical/{id}` → extract events with `Minutes`,
  `PlayerId`, type → build a timeline + `Stats` totals → prompt an LLM → render a recap.
- **Key calls:** `scores/historical/{fixtureId}`, `scores/snapshot` (`Score`, `Stats`).
- **Stack:** Node + an LLM API + a simple web/OG-image page.
- **MVP → stretch:** MVP = text recap of one match. Stretch = social image card, live running
  commentary, multi-match digest.

---

## Start this weekend (this repo is your starter)

1. `node setup.mjs` → get an API token (5 min).
2. `node probe.mjs` → see real World Cup fixtures / odds / scores (stages 2–3 of every build).
3. Pick a track; copy `probe.mjs` as your data layer.
4. Track 3 → add a frontend. Track 2 → add a bot loop. Track 1 → add the on-chain `settle` call.
5. Every "how do I…" is answered in [connect.md](./connect.md) and [data-model.md](./data-model.md).

**Picks if you want one:** Track 1 (Stat Markets) for the strongest moat; Track 3 (Win-Prob
Companion) for the fastest ship; Track 2 (Value Finder) for a pure data/agent play.
