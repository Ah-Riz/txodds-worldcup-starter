# Gotchas

Hard-won traps. Read before you lose time.

## Casing — trust the live API, not the docs

The live API returns **PascalCase** JSON keys: `FixtureId`, `Score`, `Data`, `Stats`,
`GameState`, `Action`, `Seq`, `Participant1`, `PriceNames`, `Prices`, `Bookmaker`.

The official docs' OpenAPI "Response" examples render **lowercase camelCase**
(`fixtureId`, `gameState`, `scoreSoccer`, `dataSoccer`). Those keys **do not exist** in real
responses — `scoreSoccer`/`dataSoccer` are documentation fiction. Soccer data lives under the
top-level `Score`, `Data`, and `Stats` fields.

Three different casings coexist:
- **REST responses** → PascalCase (`Score`, `Prices`).
- **on-chain IDL** → snake_case (`user_token_account`, `super_odds_type`) — see `lib/idl/txoracle.json`.
- **Anchor `.accounts({})`** → camelCase (`userTokenAccount`) even with the snake_case IDL;
  Anchor normalizes, so pass camelCase keys (matches [`setup.mjs`](../setup.mjs)).

If a field is `undefined`, check the casing first.

## Public devnet SOL faucet is unreliable

`connection.requestAirdrop` against `api.devnet.solana.com` frequently fails with
`-32603 Internal error` / rate-limit. Options, easiest first:

1. Fund the wallet from an existing funded devnet keypair (`solana transfer <pubkey> 1 --url devnet`).
2. Retry with backoff / smaller amount.
3. Use a free Helius/QuickNode devnet RPC with its own faucet.

You only need a little SOL for tx fees + ATA rent; the free subscription itself costs 0 TxL.

## `subscribe` is not idempotent — `6016 activeSubscription`

Once a wallet subscribes, calling `subscribe` again errors `6016 activeSubscription`. Token
activation **requires a fresh subscribe txSig**, so a wallet can only activate once per subscription
window. To start over: delete `.wallet.json`, generate a new wallet, and re-run `setup.mjs`.

## `weeks` must be a multiple of 4

`subscribe(serviceLevel, weeks)` rejects non-multiples-of-4 with `6041 invalidWeeks`. Use 4, 8, 12…
(default `DURATION_WEEKS=4`).

## TxL ATA must exist before subscribe

The `subscribe` CPI transfers (0 tokens on the free tier, but the instruction still loads the
source account). Create the user TxL ATA idempotently first — `setup.mjs` does this with
`createAssociatedTokenAccountIdempotentInstruction`. TxL uses **Token-2022**, not the legacy token
program.

## Network must be consistent end-to-end

A devnet `subscribe` txSig cannot be activated on the mainnet host (and vice versa). RPC, program
ID, TxL mint, guest JWT, and the activate endpoint must all be on the same network. Pick once and
keep it in `.env` `NETWORK`.

## Real-time (level 12) is mainnet-only

Devnet documents only level `1` (60s delay). Level `12` (real-time) is mainnet-only. Both are free.
To switch to real-time: set `NETWORK=mainnet`, `SERVICE_LEVEL=12`, and fund the wallet with real
SOL for fees.

## Free tier scope is narrow

Free levels 1/12 cover **World Cup + International Friendlies only**. The broader StablePrice
league CSV (10–All Leagues) requires paid tiers 2–11. Don't expect non-WC competitions in
`/api/fixtures/snapshot`.

## Scores snapshot can be empty for pre-match

`/api/scores/snapshot/{fixtureId}` returns an empty array when there are no events yet (or none in
the current 5-min interval). For a finished/recent match use `/api/scores/historical/{fixtureId}`;
for a point-in-time snapshot pass `?asOf=<ms>`.
