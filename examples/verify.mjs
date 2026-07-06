// On-chain verification — the trustless moat, demonstrated read-only.
//
// TXODDS anchors every score in a daily Merkle tree whose ROOT is published on-chain. To prove a
// single stat ("Mexico scored 2 goals") you fetch a Merkle PROOF from the API and hand it to the
// on-chain program's `validate_stat`, which checks the proof against the published root and returns
// a bool — no intermediary, no trusted oracle:
//
//   API  ──publishes──►  on-chain Merkle ROOT (daily, a PDA)
//   API  ──serves──►     Merkle PROOF for one stat  ──►  validate_stat(proof, root)  ──►  bool
//
// Run: node examples/verify.mjs   (read-only — no wallet, no SOL, no network call)
//
// ⚠ STATUS: scaffold. The `validate_stat` signature and types below are REAL (from the IDL), but
//   the proof endpoint `/api/scores/proof/{...}` is undocumented — every path variant probed
//   returned 404 (docs/endpoints.md leaves the params as `{...}`). To make this a LIVE verify,
//   confirm the proof path + response shape against the TXODDS API Reference and fill in
//   fetchProof(). The on-chain call structure here is correct regardless.
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair } from "@solana/web3.js";
import fs from "fs";
import path from "path";
import url from "url";
import dotenv from "dotenv";
import { NETWORKS } from "../lib/config.mjs";
import { decodeStats } from "../lib/decode.mjs";

dotenv.config();
process.removeAllListeners("warning"); // silence the axios punycode warning (see probe.mjs)
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Read-only program: throwaway keypair provider, never signs. Works without `node setup.mjs`.
const net = NETWORKS[process.env.NETWORK || "devnet"];
const connection = new Connection(net.rpcUrl, "confirmed");
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(Keypair.generate()), {
  commitment: "confirmed",
});
const idl = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/idl/txoracle.json"), "utf8"));
const program = new anchor.Program(idl, provider);
const DEMO = JSON.parse(fs.readFileSync(path.join(ROOT, "samples/demo.json"), "utf8"));

console.log("=== on-chain verification (read-only) ===\n");
console.log(`program     : ${program.programId.toBase58()}  (${process.env.NETWORK || "devnet"})`);
console.log(`instruction : validate_stat  →  returns bool (the verdict)\n`);

// The stat we would prove — from the captured sample. Stats key "1" = Participant1 goals.
const last = DEMO.scores[DEMO.scores.length - 1];
const p1Goals = last.Stats?.["1"];
console.log(`would prove : fixture ${DEMO.scoreFixture.FixtureId}  (${DEMO.scoreFixture.Participant1} vs ${DEMO.scoreFixture.Participant2})`);
console.log(`              stat key "1" (P1 goals) = ${p1Goals}`);
console.log(`              decoded totals: ${JSON.stringify(decodeStats(last.Stats || {}).total)}\n`);

// The REAL on-chain signature (from lib/idl/txoracle.json):
//
//   validate_stat(
//     ts: i64,
//     fixture_summary:  ScoresBatchSummary { fixture_id, update_stats, events_sub_tree_root },
//     fixture_proof:    vec<ProofNode>,
//     main_tree_proof:  vec<ProofNode>,
//     predicate:        TraderPredicate { threshold: i32, comparison: Comparison },
//     stat_a:           StatTerm { stat_to_prove: ScoreStat, event_stat_root, stat_proof: vec<ProofNode> },
//     stat_b:           option<StatTerm>,
//     op:               option<BinaryExpression { Add | Subtract }>
//   ) -> bool
//   accounts: [ daily_scores_merkle_roots ]   ← the published daily root (PDA, seeded by day)
//
console.log("ProofNode   = { hash: [u8;32], is_right_sibling: bool }   (one step of the Merkle path)");
console.log("accounts    = [ daily_scores_merkle_roots ]   (the published daily root — a PDA)\n");

console.log("Once the proof endpoint is known, a verification runs:");
console.log("  1. GET /api/scores/proof/{fixtureId}/{...}  →  { fixture_summary, fixture_proof, main_tree_proof, stat_proof }");
console.log("  2. program.methods");
console.log("       .validateStat(ts, summary, fProof, mProof, predicate, statA, null, null)");
console.log("       .accounts({ dailyScoresMerkleRoots })");
console.log("       .view()                    // → bool");
console.log("  3. true  = the stat is provably in the on-chain root (trustless, no oracle).");
console.log("     false = proof does not verify against the published root.\n");

console.log("✓ on-chain verify path is wired against the real IDL; fill fetchProof() to make it live.");
console.log("  Open question: the /api/scores/proof/{...} path params (see docs/endpoints.md).");
