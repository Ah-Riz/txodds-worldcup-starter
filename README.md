# txodds-worldcup-starter

Inspect real **TXODDS World Cup free-tier** data end-to-end: generate a Solana wallet, subscribe on-chain (free), activate an API token, then print live fixtures / odds / scores.

> **Start here → [docs/walkthrough.md](./docs/walkthrough.md).** The single narrative: what the
> data is, what the project does, how to run it, and how to read the output.
>
> The demo never depends on a live match — a captured snapshot ships in [`samples/`](./samples/):
> ```bash
> node probe.mjs --from-samples --explain   # offline, narrated — always works
> ```
> Flags: `--explain` (narrate each line), `--save` (capture to `samples/demo.json`),
> `--from-samples` (replay offline). Decoders: [`lib/decode.mjs`](./lib/decode.mjs).

## Sample output

`node probe.mjs --from-samples --explain`:

```text
=== FIXTURES (World Cup + Int. Friendlies) ===
9 fixtures
competitions: [ '430:Friendlies', '72:World Cup' ]
  World Cup fixtures: 6  (e.g. Mexico vs England)

=== ODDS snapshot ===
picked: USA vs Belgium  (World Cup, 18193785) — 4 odds entries

[0] TXLineStablePriceDemargined (10021) | type=1X2_PARTICIPANT_RESULT period=null params=null | inRunning=false state=null
  names : [ 'part1', 'draw', 'part2' ]
  prices: [ 2769, 3610, 2763 ] | pct: [ '36.114', '27.701', '36.193' ]
  → decimal odds: 2.77 / 3.61 / 2.76   (Prices ÷ 1000)
  → implied prob: 36.1% / 27.7% / 36.2%   (Pct; de-marginized for TXLineStablePriceDemargined)
…
=== SCORES snapshot ===
picked: Mexico vs England (World Cup) — 1 entries
…
Stats decoded: TOTAL P1 2G 2Y 0R 10C | P2 3G 4Y 1R 2C   H1 P1 1G 0Y 0R 4C | P2 2G 1Y 0R 2C   H2 P1 1G 0Y 0R 5C | P2 2G 1Y 0R 2C   ET1 P1 1G 2Y 0R 6C | P2 1G 3Y 1R 0C   ET2 P1 0G 0Y 0R 0C | P2 0G 0Y 0R 0C   PE P1 0G 0Y 0R 0C | P2 0G 0Y 0R 0C
  → Stats keys encode (period*1000)+baseKey: 1/2=goals, 3/4=yellow, 5/6=red, 7/8=corners (P1/P2); 0=total, +1000=H1, +2000=H2…
```

## Docs

Start with the [walkthrough](./docs/walkthrough.md), then the [decode examples](./docs/decode-examples.md).
Full reading order + reference in [`docs/`](./docs/README.md): connect · endpoints · data-model · gotchas · hackathon-ideas.

## Run

```bash
npm install
node setup.mjs    # wallet -> subscribe (devnet, free) -> activate -> writes JWT + API_TOKEN to .env
node probe.mjs    # prints World Cup fixtures, odds, scores
```

No live match? The Start-here box above has the offline replay (`--from-samples --explain`).
Run `node probe.mjs --help` for all flags.

## Config (`.env`)

| Key | Default | Notes |
| --- | --- | --- |
| `NETWORK` | `devnet` | `mainnet` for real-time level 12; free tier works on both |
| `SERVICE_LEVEL` | `1` | 1 = 60s delay (free), 12 = real-time (mainnet only) |
| `DURATION_WEEKS` | `4` | must be a multiple of 4 |

`setup.mjs` fills `JWT` and `API_TOKEN`.

## Endpoints used

- `GET /api/fixtures/snapshot` — match list (World Cup + Int. Friendlies)
- `GET /api/odds/snapshot/{fixtureId}` — StablePrice odds per market line
- `GET /api/scores/snapshot/{fixtureId}` — soccer score breakdown (goals/cards/corners per period, lineups, possession, gameState)

## Notes

- `.wallet.json` holds the secret key — never commit.
- Devnet SOL comes from the faucet (free). Switching to mainnet = fund the wallet with real SOL for tx fees (subscription itself stays $0 for levels 1/12).
- IDL vendored at `lib/idl/txoracle.json` (devnet), extracted from the official docs.
