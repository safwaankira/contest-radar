#!/usr/bin/env node
// Judge a batch of real contests with SERV Reasoning and write feed/verdicts.json (+ a copy to OUT).
// Usage: SERV_API_KEY=... node scripts/verdict-batch.mjs [out.json]
// Live contests are open ones; the backtest set is the builder's own past entries with known outcomes,
// judged from the ORIGINAL announcement post only (no hindsight).
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { verdict } from "../lib/verdict.js";
import { contestText } from "../lib/contest-text.js";

const LIVE = [
  "https://x.com/openservai/status/2121634976408174606",
  "https://x.com/HeyGen/status/2120202226010583298",
  "https://x.com/vast_ai/status/2118074691072164229",
  "https://x.com/ProtocolSociety/status/2117762805210226740",
  "https://x.com/Nition/status/2115166531462259163",
  "https://x.com/flint_trade_/status/2119905806673949049",
];
// outcome: what actually happened to our entry. "good" = entering paid off, "bad" = hours spent, $0 back.
const BACKTEST = [
  { name: "Kova thread contest", url: "https://x.com/kovafinance/status/2116304465737453588", outcome: "no place", good: false },
  { name: "Setsuna thread contest", url: "https://x.com/Setsunaprotocol/status/2116362890580303971", outcome: "no place", good: false },
  { name: "Saphyre Fright Night", url: "https://x.com/saphyre/status/2117213897761710261", outcome: "no place", good: false },
  { name: "POLYROB content bounty", url: "https://x.com/tmachinroBot/status/2118929652081099137", outcome: "no place", good: false },
  { name: "Sui Basecamp creator challenge", url: "https://x.com/SuiNetwork/status/2117702388790517946", outcome: "no place (644 entries)", good: false },
  { name: "Celo Agents on Open Rails", url: "https://www.loops.house/agents-on-open-rails", outcome: "won $200", good: true },
];

async function judge(url, now) {
  const { text } = await contestText(url, { signal: AbortSignal.timeout(20_000) });
  const v = await verdict(text, { now });
  return { ...v, input: { url } };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch((e) => ({ error: String(e.message || e), input: { url: items[k].url || items[k] } })); process.stdout.write("."); }
  }));
  return out;
}

const now = new Date();
console.log(`Judging ${LIVE.length} live contests + ${BACKTEST.length} past entries on SERV Reasoning…`);
const live = await pool(LIVE, 4, (u) => judge(u, now));
// backtest: judge as of the day each was announced is unknown here, so "open" is read against the post date
const back = await pool(BACKTEST, 4, async (b) => ({ ...(await judge(b.url, new Date("2026-10-20T00:00:00Z"))), name: b.name, outcome: b.outcome, good: b.good }));
console.log("");

const rows = back.map((r, k) => {
  const b = BACKTEST[k];
  const v = r.verdict || "ERR";
  const agree = r.error ? false : b.good ? v !== "SKIP" : v !== "ENTER";
  return { name: b.name, verdict: v, outcome: b.outcome, agree };
});
const ok = rows.filter((r) => r.agree).length;
const out = {
  generated_at: now.toISOString(),
  engine: "SERV Reasoning (OpenServ) + code decision; see lib/verdict.js",
  items: live.filter((x) => !x.error),
  errors: [...live, ...back].filter((x) => x.error).map((x) => ({ url: x.input.url, error: x.error })),
  backtest: {
    summary: `Judged from the original announcement posts, the verdict agreed with what actually happened on ${ok} of ${rows.length} of our own past entries.`,
    rows,
  },
};
for (const v of out.items) console.log(`${v.verdict.padEnd(5)} ${v.contest} — ${v.summary}`);
console.log(`Backtest: ${ok}/${rows.length}`); for (const r of rows) console.log(`  ${r.agree ? "✓" : "✗"} ${r.verdict.padEnd(5)} ${r.name} (${r.outcome})`);
if (out.errors.length) console.log("Errors:", out.errors);
writeFileSync(new URL("../feed/verdicts.json", import.meta.url), JSON.stringify(out, null, 2));
const extra = process.argv[2];
if (extra) { mkdirSync(dirname(extra), { recursive: true }); writeFileSync(extra, JSON.stringify(out, null, 2)); console.log("Saved", extra); }
