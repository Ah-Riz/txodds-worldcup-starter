# TxLINE World Cup API — Docs

TxLINE is TXODDS' sports-data API: fixtures, odds, and scores, cryptographically
verifiable on Solana. Every data point is anchored on-chain (Merkle roots) so any
price or score can be audited with no intermediary.

This project uses the **free World Cup tier**, which exposes **World Cup + International
Friendlies** data at no cost:

| Level | Delay | Network | Cost |
|-------|-------|---------|------|
| `1`   | 60 seconds | devnet + mainnet | Free |
| `12`  | real-time  | mainnet only      | Free |

Paid tiers (2–11) unlock the broader StablePrice league coverage — not needed here.

## Quickstart

```bash
npm install
node setup.mjs    # wallet -> on-chain subscribe -> activate API token
node probe.mjs    # prints live World Cup fixtures, odds, scores
```

`setup.mjs` writes `JWT` and `API_TOKEN` into `.env`. `probe.mjs` reads them.

## What you get (verified live)

- **Fixtures** — match list (teams, competition, kickoff, home/away).
- **Odds** — StablePrice consensus: 1X2, Asian handicaps, per-half and full-match markets.
- **Scores** — per-half goals / yellow / red / corners, lineups, possession, live clock, encoded on-chain stats.

## New here? Read in this order

1. [walkthrough.md](./walkthrough.md) — start here. What the data is, what the project does, how to run it.
2. [decode-examples.md](./decode-examples.md) — the arithmetic behind every number (Prices→odds, Pct→implied %, Stats→per-half stats), on real captured data.
3. [data-model.md](./data-model.md) — full field reference (PascalCase) + live samples.
4. [connect.md](./connect.md) — the auth flow (guest JWT → on-chain subscribe → activate token).
5. [gotchas.md](./gotchas.md) — the traps (casing, faucet, re-subscribe, …). Skim before something breaks.
6. [hackathon-ideas.md](./hackathon-ideas.md) — what to build on this data ($50K pool, three tracks).

Captured sample + annotations live in [`../samples/`](../samples/) (`demo.json`, `demo.annotated.md`).

## Docs index

| Doc | What's in it |
|-----|--------------|
| [hackathon-ideas.md](./hackathon-ideas.md) | Per-track build ideas (Prediction Markets / Trading Tools / Fan Experience) to share with teammates |
| [connect.md](./connect.md) | How to authenticate: guest JWT → on-chain subscribe → activate token → REST headers |
| [endpoints.md](./endpoints.md) | Every endpoint: method, path, params, status codes |
| [data-model.md](./data-model.md) | Response field reference (PascalCase) + live samples |
| [gotchas.md](./gotchas.md) | The traps that cost time (casing, faucet, re-subscribe, …) |

Start at [connect.md](./connect.md) if you need credentials, or [data-model.md](./data-model.md)
if you already have a token and just want to read responses.
