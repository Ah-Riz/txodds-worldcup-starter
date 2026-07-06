// Inspect real World Cup free-tier data: fixtures -> odds -> scores.
//
//   node probe.mjs                            live read (needs JWT + API_TOKEN in .env)
//   node probe.mjs --explain                  narrate each line (great for talks)
//   node probe.mjs --save                     also write samples/demo.json for offline reuse
//   node probe.mjs --from-samples             replay samples/demo.json, NO network
//   node probe.mjs --from-samples --explain   talk-safe: never fails on stage
import fs from "fs";
import path from "path";
import url from "url";
import util from "util";
import dotenv from "dotenv";
import { NETWORKS } from "./lib/config.mjs";
import { makeClient, AuthError } from "./lib/api.mjs";
import { decimalOdds, impliedPct, decodeStats } from "./lib/decode.mjs";

// ponytail: silence the punycode deprecation warning axios spurts every run. Node has no clean
// per-warning public API and ESM import hoisting beats in-code env vars, so we drop the default
// 'warning' printer. If a warning still leaks on your Node version, run: node --no-deprecation probe.mjs
process.removeAllListeners("warning");

dotenv.config();
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SAMPLES = path.join(__dirname, "samples", "demo.json");

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`Usage: node probe.mjs [flags]

  (no flags)      live read — needs JWT + API_TOKEN in .env (run: node setup.mjs)
  --explain       narrate each line (show the decode arithmetic inline)
  --save          also write samples/demo.json (capture for offline reuse)
  --from-samples  replay samples/demo.json, NO network (talk-safe)
  --help, -h      this message

Combine:  node probe.mjs --from-samples --explain   # offline + narrated, never fails`);
  process.exit(0);
}
const explain = argv.includes("--explain");
const save = argv.includes("--save");
const fromSamples = argv.includes("--from-samples");

const USE_COLOR = process.stdout.isTTY; // no ANSI when piped to a file/slide
const inspect = (o) => util.inspect(o, { depth: 10, colors: USE_COLOR, maxArrayLength: 8 });
const home = (f) => (f?.Participant1IsHome ? f?.Participant1 : f?.Participant2);
const away = (f) => (f?.Participant1IsHome ? f?.Participant2 : f?.Participant1);
const pct = (n) => (n == null ? "NA" : `${n.toFixed(1)}%`);

let fixtures = [], oddsFixture = null, odds = [], scoreFixture = null, scores = [];

if (fromSamples) {
  if (!fs.existsSync(SAMPLES)) {
    console.error(`✖ no ${path.relative(process.cwd(), SAMPLES)} — run once live: node probe.mjs --save`);
    process.exit(1);
  }
  console.log(`(offline mode — reading ${path.relative(process.cwd(), SAMPLES)})`);
  ({ fixtures, oddsFixture, odds, scoreFixture, scores } = JSON.parse(fs.readFileSync(SAMPLES, "utf8")));
} else {
  const net = NETWORKS[process.env.NETWORK || "devnet"];
  const jwt = process.env.JWT;
  const apiToken = process.env.API_TOKEN;
  if (!jwt || !apiToken) {
    console.error("✖ JWT/API_TOKEN missing in .env — run: node setup.mjs");
    process.exit(1);
  }
  const api = makeClient({ net, jwt, apiToken });

  // --- fixtures (top-level auth failure must NOT look like "no data") ---
  let fixRes;
  try {
    fixRes = await api.get("/api/fixtures/snapshot");
  } catch (e) {
    if (e instanceof AuthError) { console.error(`\n✖ ${e.message}`); process.exit(1); }
    throw e;
  }
  fixtures = fixRes.data;
  if (!fixtures.length) {
    console.error("✖ no fixtures returned — devnet may have no WC data today; try NETWORK=mainnet, or: node probe.mjs --from-samples");
    process.exit(1);
  }

  // --- odds / scores: first fixture that actually has a live snapshot ---
  // Per-fixture empties are fine (skip); an AuthError is global, so rethrow it.
  for (const f of fixtures) {
    if (oddsFixture) break;
    try {
      const o = (await api.get(`/api/odds/snapshot/${f.FixtureId}`)).data;
      if (o.length) { oddsFixture = f; odds = o; }
    } catch (e) { if (e instanceof AuthError) throw e; }
  }
  for (const f of fixtures) {
    if (scoreFixture) break;
    try {
      const s = (await api.get(`/api/scores/snapshot/${f.FixtureId}`)).data;
      if (s.length) { scoreFixture = f; scores = s; }
    } catch (e) { if (e instanceof AuthError) throw e; }
  }
}

// ---- render (shared by live + offline) ----
console.log("\n=== FIXTURES (World Cup + Int. Friendlies) ===");
console.log(`${fixtures.length} fixtures`);
console.log("competitions:", [...new Set(fixtures.map((f) => `${f.CompetitionId}:${f.Competition}`))]);
const wc = fixtures.filter((f) => /world cup/i.test(f.Competition || ""));
console.log(`  World Cup fixtures: ${wc.length}  (e.g. ${wc[0] ? home(wc[0]) + " vs " + away(wc[0]) : "n/a"})`);

console.log("\n=== ODDS snapshot ===");
if (!oddsFixture) {
  console.log("no fixture has a live odds snapshot in the current 5-min interval (pre-match).");
} else {
  console.log(`picked: ${home(oddsFixture)} vs ${away(oddsFixture)}  (${oddsFixture.Competition}, ${oddsFixture.FixtureId}) — ${odds.length} odds entries`);
  odds.slice(0, 5).forEach((o, i) => {
    console.log(`\n[${i}] ${o.Bookmaker} (${o.BookmakerId}) | type=${o.SuperOddsType} period=${o.MarketPeriod} params=${o.MarketParameters} | inRunning=${o.InRunning} state=${o.GameState}`);
    console.log("  names :", o.PriceNames);
    console.log("  prices:", o.Prices, "| pct:", o.Pct);
    if (explain) {
      const dec = decimalOdds(o), imp = impliedPct(o);
      console.log(`  → decimal odds: ${dec.map((d) => d.toFixed(2)).join(" / ")}   (Prices ÷ 1000)`);
      console.log(`  → implied prob: ${imp.map(pct).join(" / ")}   (Pct; de-marginized for TXLineStablePriceDemargined)`);
    }
  });
}

console.log("\n=== SCORES snapshot ===");
if (!scoreFixture) {
  console.log("no fixture has live score events right now. Re-run during/after a World Cup match, or: node probe.mjs --from-samples");
  console.log("  Score shape (PascalCase): Score{Participant1/2{H1,HT,H2,ET1,ET2,PE,Total{Goals,YellowCards,RedCards,Corners}}}, Data, Stats");
} else {
  console.log(`picked: ${home(scoreFixture)} vs ${away(scoreFixture)} (${scoreFixture.Competition}) — ${scores.length} entries`);
  const s = scores[scores.length - 1];
  console.log(`gameState: ${s.GameState} | action: ${s.Action} | seq: ${s.Seq} | type: ${s.Type} | coverage: ${s.CoverageType}`);
  console.log("clock:", inspect(s.Clock));
  console.log("Score (per half):", inspect(s.Score));
  console.log("last Data (action):", inspect(s.Data));
  const decoded = decodeStats(s.Stats || {});
  const line = (p) => {
    const d = decoded[p];
    return d ? `${p.toUpperCase()} P1 ${d.p1.g}G ${d.p1.y}Y ${d.p1.r}R ${d.p1.c}C | P2 ${d.p2.g}G ${d.p2.y}Y ${d.p2.r}R ${d.p2.c}C` : null;
  };
  console.log("Stats decoded:", ["total", "h1", "h2", "et1", "et2", "pe"].map(line).filter(Boolean).join("   "));
  if (explain) {
    console.log("  → Stats keys encode (period*1000)+baseKey: 1/2=goals, 3/4=yellow, 5/6=red, 7/8=corners (P1/P2); 0=total, +1000=H1, +2000=H2…");
    console.log("  → raw Stats:", inspect(s.Stats));
  }
}

if (save && !fromSamples) {
  fs.mkdirSync(path.dirname(SAMPLES), { recursive: true });
  fs.writeFileSync(SAMPLES, JSON.stringify({ fixtures, oddsFixture, odds, scoreFixture, scores }, null, 2));
  console.log(`\n✓ wrote ${path.relative(process.cwd(), SAMPLES)}  (replay offline: node probe.mjs --from-samples)`);
}
console.log("\n✓ done");
