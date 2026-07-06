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
