# Walkthrough — start here

This repo is a teaching example: it connects to **TXODDS' TxLINE API**, subscribes on Solana
(free), and prints **real World Cup fixtures, odds, and scores**. About ten minutes from clone to
seeing live data — and it ships a captured snapshot so the demo never depends on a live match.

## TL;DR

```bash
npm install
node setup.mjs      # wallet → on-chain subscribe → activate API token (writes .env)
node probe.mjs      # prints World Cup fixtures, odds, scores
```

No network or live match right now? This always works — it replays a captured snapshot, narrated:

```bash
node probe.mjs --from-samples --explain   # offline, never fails
```

## What you'll see

`probe.mjs` prints three sections — **fixtures** (which matches), **odds** (the prices), and
**scores** (goals / cards / corners per half). With `--explain` it also prints the arithmetic
behind each number. That arithmetic is walked step-by-step in
[decode-examples.md](./decode-examples.md).

## The two things that make this data special

1. **True (de-marginized) odds.** The free tier's bookmaker is `TXLineStablePriceDemargined` — the
   bookie margin is removed, so `Pct` is the *real* implied probability. A normal bookie's prices
   sum to ~105% (the extra ~5% is their cut); on this feed they sum to ~100%. See it proven on real
   numbers in [decode-examples.md](./decode-examples.md).
2. **Rich, composable live stats.** Per-half goals / yellow / red / corners, encoded in a single
   flat `Stats` map keyed `(period*1000)+key` — so a market can target "first-half corners > 3" or
   any stat in any period.

(Bonus: every data point is anchored on-chain via Merkle roots, so any price or score can be
audited with no intermediary. That's the hackathon angle — see [hackathon-ideas.md](./hackathon-ideas.md).)

## What the project does (plain English)

`setup.mjs` runs a 4-step onboarding **once**:

```
 wallet ──► guest JWT ──► on-chain subscribe ──► activate token ──► REST data calls
   │           │                 │                     │                   │
 keypair      POST              program.subscribe     sign + POST         GET /api/fixtures · odds · scores
 .wallet.json /auth/guest/start (level, weeks)        /api/token/activate needs jwt + apiToken headers
              short-lived       pays 0 TxL (free)     proves the wallet
```

| Step | What | Why |
|------|------|-----|
| 1. wallet | Generate a Solana keypair (`.wallet.json`) | You need an on-chain identity to subscribe. |
| 2. guest JWT | `POST /auth/guest/start` | A short-lived session token. |
| 3. subscribe | On-chain `subscribe(level, weeks)` tx | The free tier costs 0 tokens, but the on-chain tx is what authorizes you. |
| 4. activate | Sign `txSig::jwt`, `POST /api/token/activate` | Proves you hold the wallet that subscribed → get a long-lived `API_TOKEN`. |

Result: `JWT` + `API_TOKEN` land in `.env`. Every data call then needs **both** as headers.

`probe.mjs` calls three read endpoints and decodes the output:

- `GET /api/fixtures/snapshot` — the match list
- `GET /api/odds/snapshot/{fixtureId}` — prices per market line
- `GET /api/scores/snapshot/{fixtureId}` — the score/stat event stream (last entry = current state)

## New to Solana? (30-second primer)

- **Keypair / wallet** — a public key (your address) + secret key (signs txs). Stored in
  `.wallet.json`. Never share the secret.
- **Airdrop** — devnet hands out free SOL for tx fees. Mainnet costs real SOL. The free
  *subscription* itself costs 0 tokens either way.
- **PDA** (Program Derived Address) — an address the program controls deterministically (no private
  key). Used for the token treasury.
- **ATA** (Associated Token Account) — your per-token balance account. `subscribe` needs your TxL
  ATA to exist first.
- **Token-2022** — Solana's newer token program. TxL (the subscription token) uses it, not the
  legacy SPL token program.

For depth: [connect.md](./connect.md). For traps: [gotchas.md](./gotchas.md).

## Reading the output

```
 GET /api/fixtures/snapshot ──┐
 GET /api/odds/snapshot/{id} ─┼──► decode ──────────► readable output
 GET /api/scores/snapshot/{id}┘
                               Prices ÷ 1000           → decimal odds (2.77 / 3.61 / 2.76)
                               Pct                     → implied % (de-marginized, sums to ~100%)
                               Stats (period*1000)+key → per-half goals / cards / corners
```

Run `node probe.mjs --from-samples --explain` and follow along with
[decode-examples.md](./decode-examples.md) — every number in the output is derived there.

## Go further

The de-marginized odds + composable per-half stats + on-chain Merkle settlement are TXODDS' actual
moat — most sports APIs give you none of these.

**See the moat in code:** [`../examples/verify.mjs`](../examples/verify.mjs) — the on-chain
`validate_stat` instruction that proves a score against a published Merkle root, no intermediary
(read-only; shows the real IDL signature + proof flow).

When you're ready to build on it (prediction markets, value finders, fan apps):
[hackathon-ideas.md](./hackathon-ideas.md). Every endpoint: [endpoints.md](./endpoints.md).
Field reference: [data-model.md](./data-model.md).
