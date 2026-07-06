// Full fresh-start flow: wallet -> (devnet airdrop) -> subscribe on-chain -> activate API token.
// Run: node setup.mjs
import fs from "fs";
import path from "path";
import url from "url";
import axios from "axios";
import dotenv from "dotenv";
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import nacl from "tweetnacl";

import { NETWORKS, TOKEN_PROGRAM, ASSOCIATED_TOKEN_PROGRAM_ID, SYSTEM_PROGRAM_ID, deriveAccounts } from "./lib/config.mjs";

dotenv.config();

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const WALLET_PATH = path.join(__dirname, ".wallet.json");
const ENV_PATH = path.join(__dirname, ".env");

const NETWORK = process.env.NETWORK || "devnet";
const SERVICE_LEVEL = Number(process.env.SERVICE_LEVEL || 1);
const DURATION_WEEKS = Number(process.env.DURATION_WEEKS || 4);
const net = NETWORKS[NETWORK];
if (SERVICE_LEVEL === 12 && NETWORK !== "mainnet") {
  console.warn("⚠ level 12 (real-time) is mainnet-only; continuing with level on devnet may fail.");
}

function log(...a) { console.log(...a); }

// --- 1. wallet ---
let kp;
if (fs.existsSync(WALLET_PATH)) {
  kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, "utf8"))));
  log(`wallet loaded: ${kp.publicKey.toBase58()}`);
} else {
  kp = Keypair.generate();
  fs.writeFileSync(WALLET_PATH, JSON.stringify(Array.from(kp.secretKey)));
  log(`wallet generated: ${kp.publicKey.toBase58()}  (saved .wallet.json)`);
}

const connection = new Connection(net.rpcUrl, "confirmed");
const wallet = new anchor.Wallet(kp);
const provider = new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" });
anchor.setProvider(provider);
const idl = JSON.parse(fs.readFileSync(path.join(__dirname, "lib/idl/txoracle.json"), "utf8"));
const program = new anchor.Program(idl, provider);
if (program.programId.toBase58() !== net.programId.toBase58()) {
  throw new Error(`IDL programId ${program.programId} != ${NETWORK} ${net.programId}`);
}

// --- 2. fund (devnet airdrop) ---
const bal = await connection.getBalance(kp.publicKey);
log(`balance: ${bal / LAMPORTS_PER_SOL} SOL`);
if (NETWORK === "devnet" && bal < 0.5 * LAMPORTS_PER_SOL) {
  log("requesting 2 SOL devnet airdrop...");
  const sig = await connection.requestAirdrop(kp.publicKey, 2 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
  log(`airdrop confirmed: ${sig}`);
}

// --- 3. ensure user TxL ATA exists (subscribe CPI may demand it even for 0-fee free tier) ---
const accts = deriveAccounts(net, kp.publicKey);
const ataInfo = await connection.getAccountInfo(accts.userTokenAccount);
if (!ataInfo) {
  log("creating TxL ATA...");
  const ix = createAssociatedTokenAccountIdempotentInstruction(
    kp.publicKey, accts.userTokenAccount, kp.publicKey,
    net.txlTokenMint, TOKEN_PROGRAM, ASSOCIATED_TOKEN_PROGRAM_ID
  );
  await sendAndConfirmTransaction(connection, new Transaction().add(ix), [kp]);
  log("TxL ATA created");
} else {
  log("TxL ATA exists");
}

// --- 4. guest JWT ---
log(`starting guest session on ${NETWORK}...`);
const guestRes = await axios.post(`${net.apiOrigin}/auth/guest/start`);
const jwt = guestRes.data.token;
log("guest JWT acquired");

// --- 5. subscribe on-chain ---
log(`subscribing (level ${SERVICE_LEVEL}, ${DURATION_WEEKS}w)...`);
let txSig;
try {
  txSig = await program.methods
    .subscribe(SERVICE_LEVEL, DURATION_WEEKS)
    .accounts({
      user: kp.publicKey,
      pricingMatrix: accts.pricingMatrixPda,
      tokenMint: net.txlTokenMint,
      userTokenAccount: accts.userTokenAccount,
      tokenTreasuryVault: accts.tokenTreasuryVault,
      tokenTreasuryPda: accts.tokenTreasuryPda,
      tokenProgram: TOKEN_PROGRAM,
      systemProgram: SYSTEM_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    })
    .rpc();
} catch (e) {
  const msg = e?.error?.error?.message || e?.message || String(e);
  if (/active subscription/i.test(msg)) {
    console.error("\n✖ Already subscribed on-chain. Activation needs a fresh subscribe txSig.");
    console.error("  Delete .wallet.json to start over, or reuse a previously-saved txSig.");
    process.exit(1);
  }
  throw e;
}
log(`subscribe tx: ${txSig}`);

// --- 6. sign + activate ---
const message = `${txSig}::${jwt}`; // empty leagues -> "::" separator per docs
const sigBytes = nacl.sign.detached(Buffer.from(message, "utf8"), kp.secretKey);
const walletSignature = Buffer.from(sigBytes).toString("base64");

log("activating API token...");
const actRes = await axios.post(
  `${net.apiOrigin}/api/token/activate`,
  { txSig, walletSignature, leagues: [] },
  { headers: { Authorization: `Bearer ${jwt}` } }
);
const apiToken = actRes.data.token || actRes.data;
if (typeof apiToken !== "string" || apiToken.length < 10) {
  throw new Error(`unexpected activate response: ${JSON.stringify(actRes.data).slice(0, 300)}`);
}
log(`API token acquired (${apiToken.length} chars)`);

// --- 7. persist to .env ---
upsertEnv("JWT", jwt);
upsertEnv("API_TOKEN", apiToken);
log("✓ wrote JWT + API_TOKEN to .env");
log('next: node probe.mjs');

function upsertEnv(key, value) {
  const lines = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8").split("\n") : [];
  const idx = lines.findIndex((l) => l.startsWith(`${key}=`));
  const entry = `${key}=${value}`;
  if (idx >= 0) lines[idx] = entry; else lines.push(entry);
  fs.writeFileSync(ENV_PATH, lines.join("\n"));
}
