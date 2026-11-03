// Builds the proof-of-payment page from the chain itself (Blockscout), joined with our ledger:
//   - every payment the agent made to services it doesn't control (buy, Agent402), with tx links
//   - every scan payment it received, and whether each payer counts as an independent user
//   - daily onchain anchors and the ERC-8004 registration
// Writes feed/proof.md (served on the site) and PROOF.md (repo snapshot).
//
//   node scripts/proof.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { KNOWN_PAYEES } from "../lib/config.js";

const ROOT = new URL("..", import.meta.url);
const EXPLORER = "https://celo.blockscout.com";
const AGENT = (process.env.AGENT_ADDRESS || "0x6859Abd01F1686E9DDfE809CC69Fab1054447457").toLowerCase();
const SITE = process.env.SITE_URL || "https://contest-radar-celo.vercel.app";
// Hackathon kick-off (Tue 6 Oct 2026). An independent user had Celo activity before this.
const HACKATHON_START = Date.parse(process.env.HACKATHON_START || "2026-10-06T00:00:00Z");
// Wallets that are ours or were funded by us; their payments never count as users.
const OURS = new Set([AGENT, "0xd9aaa6234ac620cde2fe5c6a2ffd5a8cc86e7293", ...(process.env.OUR_WALLETS || "").split(",")]
  .map((a) => a.trim().toLowerCase()).filter(Boolean));
const SERVICE = { [KNOWN_PAYEES[0]]: "buy gateway (TikHub X / Reddit search)", [KNOWN_PAYEES[1]]: "Agent402 metered chat (gpt-4o-mini)" };
// Celo fee abstraction bookkeeping when gas is paid in USDC: not purchases, not income.
const ZERO = "0x0000000000000000000000000000000000000000";
const FEE_SINKS = ["0x4200000000000000000000000000000000000011", "0xcd437749e43a154c07f3553504c68fbfd56b8778"];
const REGISTRATION_TX = "0x62b225b16d2e7bce4a2b4dfb8d7c59e2f9c8a5e00d23dfe30bc848f1f16d19b7";

const readJson = (p, d) => (existsSync(new URL(p, ROOT)) ? JSON.parse(readFileSync(new URL(p, ROOT), "utf8")) : d);

async function getJson(url) {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
  }
  throw new Error(`Blockscout ${url} failed`);
}

async function allTransfers(addr) {
  const out = [];
  let params = "";
  for (let page = 0; page < 40; page++) {
    const d = await getJson(`${EXPLORER}/api/v2/addresses/${addr}/token-transfers?type=ERC-20${params}`);
    out.push(...(d.items || []));
    if (!d.next_page_params) break;
    params = "&" + new URLSearchParams(d.next_page_params).toString();
  }
  return out;
}

/** Independent = not ours, never funded by us, and active on Celo before the hackathon started. */
async function independence(payer) {
  if (OURS.has(payer)) return { independent: false, why: "our own test wallet" };
  const v1 = (action) => getJson(`${EXPLORER}/api?module=account&action=${action}&address=${payer}&sort=asc&page=1&offset=25`);
  const [txs, toks] = await Promise.all([v1("txlist"), v1("tokentx")]);
  const tx = Array.isArray(txs.result) ? txs.result : [];
  const tt = Array.isArray(toks.result) ? toks.result : [];
  const firstSeen = Math.min(...[...tx, ...tt].map((x) => Number(x.timeStamp) * 1000).filter(Boolean), Infinity);
  const fundedByUs = tt.some((x) => x.to?.toLowerCase() === payer && OURS.has(x.from?.toLowerCase()))
    || tx.some((x) => x.to?.toLowerCase() === payer && OURS.has(x.from?.toLowerCase()) && x.value !== "0");
  if (fundedByUs) return { independent: false, why: "received funds from us", firstSeen };
  if (!(firstSeen < HACKATHON_START)) return { independent: false, why: "no Celo activity before 6 Oct", firstSeen };
  return { independent: true, why: `active on Celo since ${new Date(firstSeen).toISOString().slice(0, 10)}`, firstSeen };
}

const usd = (x) => Number(x.total?.value || 0) / 10 ** Number(x.total?.decimals || 6);
const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const txl = (h) => `[${h.slice(0, 10)}…](${EXPLORER}/tx/${h})`;
const day = (iso) => iso.replace("T", " ").slice(0, 16) + " UTC";

const transfers = (await allTransfers(AGENT)).filter((x) => {
  const f = x.from?.hash?.toLowerCase(), t = x.to?.hash?.toLowerCase();
  return f !== ZERO && t !== ZERO && !FEE_SINKS.includes(t);
});
const from = (x) => x.from.hash.toLowerCase();
const to = (x) => x.to.hash.toLowerCase();

// Route names come from our ledger (the chain only shows the payee).
const ledger = readJson("feed/ledger.json", { runs: [] });
const routeByTx = new Map();
for (const r of ledger.runs) for (const rc of r.receipts || []) if (rc.tx) routeByTx.set(rc.tx.toLowerCase(), { route: rc.route, label: r.kind });

const paid = transfers.filter((x) => from(x) === AGENT && SERVICE[to(x)]).reverse();
const received = transfers.filter((x) => to(x) === AGENT && usd(x) > 0 && usd(x) <= 0.05 + 1e-9).reverse();
const refunds = transfers.filter((x) => from(x) === AGENT && !SERVICE[to(x)] && usd(x) <= 0.05 + 1e-9).reverse();

const payers = [...new Set(received.map(from))];
const users = {};
for (const p of payers) users[p] = await independence(p);

const byService = {};
for (const x of paid) {
  const s = (byService[SERVICE[to(x)]] ??= { n: 0, usd: 0, days: new Set() });
  s.n++; s.usd += usd(x); s.days.add(x.timestamp.slice(0, 10));
}
const independents = payers.filter((p) => users[p].independent);
const anchors = readJson("feed/anchors.json", { anchors: [] }).anchors;

const L = [];
L.push("# Contest Radar: proof of payment", "");
L.push(`Generated ${day(new Date().toISOString())} from the chain (Blockscout) and the agent's ledger. Live version: ${SITE}/feed/proof.md`, "");
L.push(`- **Agent wallet (x402 PayTo for scans):** [\`${AGENT}\`](${EXPLORER}/address/${AGENT})`);
L.push(`- **ERC-8004:** agentId 10034, registration ${txl(REGISTRATION_TX)}`);
L.push("- **Attribution tag:** `celo_683ee8609385` on every transaction the agent sends (anchors, registration, scan settlements, refunds). Gas is paid by the agent in USDC through fee abstraction; no relayer.");
L.push("- **Payments to buy and Agent402** are x402 EIP-3009 authorisations signed by the agent wallet and submitted by the seller's facilitator, so they show as transfers from the agent to the payee.", "");
L.push("## Paid calls to services we don't control", "");
L.push("| Service | Payee | Paid calls | Spent | Days with calls |", "|---|---|---:|---:|---:|");
for (const [name, s] of Object.entries(byService)) {
  const payee = Object.keys(SERVICE).find((k) => SERVICE[k] === name);
  L.push(`| ${name} | [\`${short(payee)}\`](${EXPLORER}/address/${payee}) | ${s.n} | $${s.usd.toFixed(3)} | ${s.days.size} |`);
}
L.push("", `The first calls on 3 Nov were build and test runs while wiring up buy (including one charged-then-failed Cencori call, reported to buy in the README). Since then the agent makes one scheduled daily run (2 X searches, 1 Reddit search, 1 model read, about $0.02) plus whatever personal scans people buy. We don't make calls to pad the count.`, "");
L.push("## Scan sales (x402, POST /api/scan)", "");
L.push(`${received.length} paid scan(s) from ${payers.length} wallet(s); **${independents.length} independent user(s)** by the hackathon's definition (not ours, not funded by us, active on Celo before 6 Oct).`, "");
if (received.length) {
  L.push("| When | Payer | Amount | Settlement | Independent? |", "|---|---|---:|---|---|");
  for (const x of received) {
    const u = users[from(x)];
    L.push(`| ${day(x.timestamp)} | [\`${short(from(x))}\`](${EXPLORER}/address/${from(x)}) | $${usd(x).toFixed(2)} ${x.token?.symbol || ""} | ${txl(x.transaction_hash)} | ${u.independent ? "yes" : "no"}: ${u.why} |`);
  }
}
if (refunds.length) {
  L.push("", "Refunds (sent automatically when the paid sources failed):", "");
  for (const x of refunds) L.push(`- ${day(x.timestamp)}: $${usd(x).toFixed(2)} to \`${short(to(x))}\`, ${txl(x.transaction_hash)}`);
}
L.push("", "## Every paid call", "", "| When | Service | Route | Amount | Tx |", "|---|---|---|---:|---|");
for (const x of paid) {
  const r = routeByTx.get(x.transaction_hash.toLowerCase());
  L.push(`| ${day(x.timestamp)} | ${SERVICE[to(x)].split(" (")[0]} | ${r ? `\`${r.route}\` (${r.label})` : "personal scan or pre-ledger run"} | $${usd(x).toFixed(4)} | ${txl(x.transaction_hash)} |`);
}
L.push("", "## Daily onchain anchors", "", "keccak256 of that day's `feed/latest.json`, written as calldata of a tagged zero-value self-transaction.", "");
for (const a of anchors.slice(0, 30)) L.push(`- ${day(a.at)}: ${txl(a.tx)} (\`${a.feed_hash.slice(0, 18)}…\`)`);
L.push("");

const md = L.join("\n");
writeFileSync(new URL("feed/proof.md", ROOT), md);
writeFileSync(new URL("PROOF.md", ROOT), md);
writeFileSync(new URL("feed/proof.json", ROOT), JSON.stringify({
  generated_at: new Date().toISOString(), agent: AGENT,
  paid_calls: Object.fromEntries(Object.entries(byService).map(([k, s]) => [k, { calls: s.n, usd: +s.usd.toFixed(4), days: s.days.size }])),
  scans: received.length, payers: payers.length, independent_users: independents,
}, null, 2) + "\n");
console.log(`proof: ${paid.length} paid calls, ${received.length} scans, ${independents.length} independent users`);
