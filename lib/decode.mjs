// Decode helpers for TXODDS World Cup data.
// The two non-obvious encodings every consumer must undo:
//   - Prices are ×1000 fixed-point → divide by 1000 for decimal odds.
//   - Stats keys are (period * 1000) + baseKey  (see docs/data-model.md).
//
// Run standalone to see the worked example:  node lib/decode.mjs
// Arithmetic walked step-by-step: docs/decode-examples.md

// Prices:[6315, 2247, 2526]  →  [6.315, 2.247, 2.526]  (= decimal odds 6.32 / 2.25 / 2.53)
export const decimalOdds = (o) => (o.Prices || []).map((p) => p / 1000);

// Pct holds implied probability %. For the TXLineStablePriceDemargined bookmaker this is
// de-marginized (fair value, bookie margin removed). "NA" (quarter-ball handicaps) → null.
export const impliedPct = (o) =>
  (o.Pct || []).map((x) => (x === "NA" ? null : Number(x)));

// Split an encoded Stats key into its period and base key.
//   period: 0 = total, 1 = H1, 2 = H2, 3 = ET1, 4 = ET2, 5 = PE
//   baseKey: 1/2 = P1/P2 goals, 3/4 = yellow, 5/6 = red, 7/8 = corners
export const decodeStatKey = (key) => {
  const k = Number(key);
  return { period: Math.floor(k / 1000), baseKey: k % 1000 };
};

const PERIODS = ["total", "h1", "h2", "et1", "et2", "pe"];
const BASE = {
  1: ["p1", "g"], 2: ["p2", "g"],
  3: ["p1", "y"], 4: ["p2", "y"],
  5: ["p1", "r"], 6: ["p2", "r"],
  7: ["p1", "c"], 8: ["p2", "c"],
};
const blank = () => ({ p1: { g: 0, y: 0, r: 0, c: 0 }, p2: { g: 0, y: 0, r: 0, c: 0 } });

// Decode the full Stats map into per-period { p1, p2 } × { g, y, r, c }.
// Unknown base keys (lineups, possession, …) are skipped.
export const decodeStats = (stats = {}) => {
  const out = {};
  for (const [key, val] of Object.entries(stats)) {
    const { period, baseKey } = decodeStatKey(key);
    const map = BASE[baseKey];
    if (!map) continue;
    const [side, stat] = map;
    const name = PERIODS[period] || `p${period}`;
    (out[name] ||= blank())[side][stat] = val;
  }
  return out;
};

// --- runnable self-check (this IS the worked example) ---
import url from "url";
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  const odds = { Prices: [6315, 2247, 2526], Pct: ["15.748", "44.504", "39.746"] };
  console.log("odds input :", odds);
  console.log("decimalOdds:", decimalOdds(odds), "→ display 6.32 / 2.25 / 2.53");
  console.log("impliedPct :", impliedPct(odds), "→ 15.7% / 44.5% / 39.7%");

  const stats = { "1": 1, "2": 0, "7": 2, "8": 2, "1001": 1, "2008": 2 };
  const d = decodeStats(stats);
  console.log("stats input:", stats);
  console.log("decodeStats:", JSON.stringify(d));
  // total: P1 1G/2C, P2 0G/2C  |  h1: P1 1G  |  h2: P2 2C

  const ok =
    JSON.stringify(decimalOdds(odds)) === JSON.stringify([6.315, 2.247, 2.526]) &&
    d.total.p1.g === 1 && d.total.p1.c === 2 && d.total.p2.c === 2 &&
    d.h1.p1.g === 1 && d.h2.p2.c === 2;
  console.log(ok ? "\n✓ decode self-check passed" : "\n✖ decode self-check FAILED");
  process.exit(ok ? 0 : 1);
}
