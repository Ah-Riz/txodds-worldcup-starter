# Connecting to the TxLINE API

TxLINE gates **all** data behind an on-chain Solana subscription + a short-lived
API token — even for the free World Cup tier. The full flow is:

```
wallet  ──►  guest JWT  ──►  on-chain subscribe  ──►  activate token  ──►  REST calls
```

Pick **one network** and use it for every step (RPC, program ID, mint, guest JWT, and
activate endpoint must all match). A devnet subscribe tx cannot be activated on the mainnet host.

## Networks

| | Mainnet | Devnet |
|---|---|---|
| RPC | `https://api.mainnet-beta.solana.com` | `https://api.devnet.solana.com` |
| API origin | `https://txline.txodds.com` | `https://txline-dev.txodds.com` |
| Program ID | `9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA` | `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` |
| TxL mint | `Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL` | `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG` |

TxL uses the **Token-2022** program (`TOKEN_2022_PROGRAM_ID`), not the legacy token program.

The reference implementation is [`setup.mjs`](../setup.mjs) + [`lib/config.mjs`](../lib/config.mjs);
this doc mirrors it step for step. The vendored devnet IDL is at [`lib/idl/txoracle.json`](../lib/idl/txoracle.json).

## Prerequisites

```bash
npm install @coral-xyz/anchor @solana/web3.js @solana/spl-token axios tweetnacl
```

A Solana keypair with a little SOL for tx fees (subscription itself is 0 TxL on the free tier).
On devnet, fund via faucet or transfer from a funded keypair (see [gotchas.md](./gotchas.md)).

## Step 1 — Guest JWT

Every session starts with a guest JWT from the API host root:

```js
const guest = await axios.post(`${origin}/auth/guest/start`);
const jwt = guest.data.token;
```

## Step 2 — Subscribe on-chain

Subscribe to a service level for a number of weeks. Free tiers: level `1` (60s delay) or
level `12` (real-time, mainnet only). `weeks` **must be a multiple of 4**.

Load the program and derive the accounts `subscribe` needs:

```js
import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";

const connection = new Connection(rpcUrl, "confirmed");
const wallet = new anchor.Wallet(keypair);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);

const idl = JSON.parse(readFileSync("lib/idl/txoracle.json", "utf8"));
const program = new anchor.Program(idl, provider);
```

**PDAs** (see `deriveAccounts()` in `lib/config.mjs`):

```js
const [tokenTreasuryPda]  = PublicKey.findProgramAddressSync([Buffer.from("token_treasury_v2")], programId);
const [pricingMatrixPda]  = PublicKey.findProgramAddressSync([Buffer.from("pricing_matrix")],       programId);

const tokenTreasuryVault = getAssociatedTokenAddressSync(
  txlMint, tokenTreasuryPda, true, TOKEN_2022_PROGRAM_ID
);
const userTokenAccount = getAssociatedTokenAddressSync(
  txlMint, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID
);
```

**Ensure the user TxL ATA exists** before subscribing — the `subscribe` CPI may require the
source account even though the free tier transfers 0 tokens. Create it idempotently:

```js
import { createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
// build a Transaction with this ix (payer=user, account=userTokenAccount, owner=user, mint=txlMint)
```

**Subscribe** — note `.accounts({})` uses **camelCase** keys even though the IDL is snake_case
(Anchor normalizes them):

```js
const txSig = await program.methods
  .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)        // e.g. (1, 4)
  .accounts({
    user: wallet.publicKey,
    pricingMatrix: pricingMatrixPda,
    tokenMint: txlMint,
    userTokenAccount,
    tokenTreasuryVault,
    tokenTreasuryPda,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
  })
  .rpc();
```

If this errors `6016 activeSubscription`, the wallet already has a live subscription — activation
needs a fresh `txSig`, so start over with a new wallet (see [gotchas.md](./gotchas.md)).

## Step 3 — Activate the API token

Sign the activation message and POST it. With **no custom leagues** the message is
`` `${txSig}::${jwt}` `` (empty league list → `::` separator); with leagues it would be
`` `${txSig}:${leagues.join(",")}:${jwt}` ``.

```js
import nacl from "tweetnacl";
const message = `${txSig}::${jwt}`;
const sig = nacl.sign.detached(Buffer.from(message, "utf8"), keypair.secretKey);
const walletSignature = Buffer.from(sig).toString("base64");

const res = await axios.post(
  `${origin}/api/token/activate`,
  { txSig, walletSignature, leagues: [] },
  { headers: { Authorization: `Bearer ${jwt}` } }
);
const apiToken = res.data.token ?? res.data;   // long-lived
```

## Step 4 — Call data endpoints

Every data request needs **both** headers:

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer ${jwt}` (from step 1) |
| `X-Api-Token`   | `${apiToken}` (from step 3) |

```js
const http = axios.create({
  baseURL: origin,
  headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken },
});
const fixtures = (await http.get("/api/fixtures/snapshot")).data;
```

See [endpoints.md](./endpoints.md) for all paths and [data-model.md](./data-model.md) for the
response shapes.
