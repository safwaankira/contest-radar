import { test } from "node:test";
import assert from "node:assert/strict";
import { prefilter, buildPrompt, parseModel, assemble, toItem, deadlinePoints, fallback } from "../lib/rank.js";

const now = Date.parse("2026-11-03T12:00:00Z");
const cands = [
  { id: "x:1", source: "x", url: "https://x.com/a/status/1", author: "@a", postedAt: "2026-11-02T10:00:00Z", text: "Thread contest! $500 USDC prize pool. Submit by Nov 10, quote this post", signals: { followers: 9000, verified: true, replies: 4 } },
  { id: "x:2", source: "x", url: "https://x.com/b/status/2", author: "@b", text: "gm frens what are we buying today", signals: { followers: 50 } },
  { id: "poidh:8453:9", source: "poidh", url: "https://poidh.xyz/base/bounty/9", author: "0x1", title: "Best meme", text: "Make a meme. Deadline: November 30, 2026", prizeHint: "$16.00 (base)", prizeUsd: 16, signals: { chain: "base", hasClaims: true, voting: true } },
  { id: "x:3", source: "x", url: "https://x.com/scam/status/4", author: "@scam", postedAt: "2026-11-02T10:00:00Z", text: "Win $1000! Reply with your seed phrase to claim the prize", signals: { followers: 20 } },
];

test("prefilter keeps announcements with prizes and all poidh items", () => {
  assert.deepEqual(prefilter(cands).map((c) => c.id), ["x:1", "poidh:8453:9", "x:3"]);
});

test("prompt stays under Cencori's body limit", () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ ...cands[0], id: "x" + i, text: "prize submit ".repeat(80) }));
  const { messages, used } = buildPrompt(many, new Date(now));
  assert.ok(JSON.stringify(messages).length < 32 * 1024);
  assert.ok(used > 10 && used < 200);
});

test("parseModel tolerates fences, prose and trailing commas", () => {
  const p = parseModel('Here you go:\n```json\n{"i":0,"kind":"thread","prizeUsd":500,"deadline":"2026-11-10","effort":"low","task":"write a thread"},\nnot json\n{"i":2,"kind":"meme"}\n```');
  assert.equal(p.size, 2);
  assert.equal(p.get(0).prizeUsd, 500);
});

test("items use bounty-radar's schema so the CLI, MCP server, CSV and RSS work unchanged", () => {
  const item = toItem(cands[0], { kind: "thread", prizeUsd: 500, deadline: "2026-11-10", effort: "low", task: "write a thread" }, now);
  for (const k of ["score", "opportunity_class", "effort_score", "signals", "risk_flags", "addresses", "decision_notes", "preset", "repo", "title", "url", "updated_at", "payout_amount_usd"]) assert.ok(k in item, k);
  assert.equal(item.opportunity_class, "high-value");
  assert.equal(item.deadline, "2026-11-10");
});

test("poidh's escrowed prize beats the model, and crowded entries rank lower", () => {
  const items = assemble(cands, new Map([[0, { i: 0, prizeUsd: 500, deadline: "2026-11-10", effort: "low" }], [2, { i: 2, prizeUsd: 9999, deadline: "2026-11-30" }]]), now);
  assert.equal(items[0].url, "https://x.com/a/status/1");
  const p = items.find((i) => i.source === "poidh");
  assert.equal(p.payout_amount_usd, 16);
  assert.ok(p.crowded && p.signals.includes("crowded"));
});

test("scams are scored as avoid and dropped", () => {
  const item = toItem(cands[3], { prizeUsd: 1000, deadline: "2026-11-20" }, now);
  assert.equal(item.opportunity_class, "avoid");
  assert.equal(assemble(cands, new Map([[3, { i: 3, prizeUsd: 1000 }]]), now).length, 0);
});

test("closed opportunities are dropped", () => {
  assert.equal(deadlinePoints("2026-11-01", now), null);
  assert.equal(assemble(cands, new Map([[0, { i: 0, deadline: "2026-10-01" }]]), now).length, 0);
});

test("fallback ranks poidh bounties and social posts with an explicit dollar prize", () => {
  const items = fallback(cands, now);
  assert.deepEqual(items.map((o) => o.url).sort(), ["https://poidh.xyz/base/bounty/9", "https://x.com/a/status/1"]);
  assert.equal(items.find((o) => o.source === "poidh").deadline, "2026-11-30");
});

test("links that are not https are dropped, and absurd model prizes are ignored", () => {
  assert.equal(toItem({ ...cands[0], url: "javascript:alert(1)" }, { deadline: "2026-11-10" }, now), null);
  const item = toItem({ ...cands[0], text: "Thread contest, submit by Nov 10" }, { prizeUsd: 1e12, deadline: "2026-11-10" }, now);
  assert.equal(item.payout_amount_usd, null);
});

test("prize and time left drive the score, not how clearly a payout is worded", async () => {
  const { worthScore, groupSlots } = await import("../lib/rank.js");
  assert.ok(worthScore({ prizeUsd: 3000, timing: 14, effortScore: 40 }) > worthScore({ prizeUsd: 5, timing: 8, effortScore: 30, clarity: 90 }));
  assert.equal(worthScore({ prizeUsd: 1e6, avoid: true }), 0);
  const g = groupSlots([1, 2, 3].map((n) => ({ source: "poidh", title: `Fund a task — slot ${n}/4`, payout_amount_usd: 28 })));
  assert.equal(g.length, 1);
  assert.equal(g[0].slots, 3);
});

test("prize text beats a low model number; eligibility limits lower the score; repeat announcements collapse", async () => {
  const { parsePrize, dedupeAnnouncements } = await import("../lib/rank.js");
  assert.equal(parsePrize("$8,000 in cash prizes"), 8000);
  assert.equal(parsePrize("5,200 USDT"), 5200);
  assert.equal(parsePrize("$1.5k pool"), 1500);
  assert.equal(parsePrize("0.05 ETH"), 125);
  const item = toItem({ ...cands[0], text: "Hackathon, submit by Nov 8" }, { prizeUsd: 4000, prize: "$8,000 in cash prizes", deadline: "2026-11-08" }, now);
  assert.equal(item.payout_amount_usd, 8000);
  const open = toItem(cands[0], { prizeUsd: 1500, deadline: "2026-11-08" }, now);
  const women = toItem(cands[0], { prizeUsd: 1500, deadline: "2026-11-08", restricted: "women only" }, now);
  assert.equal(women.restricted, "women only");
  assert.ok(women.score < open.score);
  const dup = dedupeAnnouncements([{ ...open, url: "https://x.com/a/status/1" }, { ...open, url: "https://x.com/a/status/2", score: open.score - 5 }]);
  assert.equal(dup.length, 1);
  assert.equal(dup[0].also_posted, 1);
});

test("eligibility limits are caught from the text when the model misses them", async () => {
  const { eligibilityFromText } = await import("../lib/rank.js");
  assert.equal(eligibilityFromText("Join our women-only hackathon for AI solutions"), "women only");
  assert.equal(eligibilityFromText("Open to everyone worldwide"), null);
  const item = toItem({ ...cands[0], text: "Women-only hackathon! $1,500 prize pool, submit by Nov 8" }, { prizeUsd: 1500, deadline: "2026-11-08", restricted: null }, now);
  assert.equal(item.restricted, "women only");
  assert.ok(item.decision_notes.some((n) => n.startsWith("prize used for ranking: $1,500")));
  assert.ok(!item.decision_notes.some((n) => n.startsWith("parsed payout amount")));
});

test("items carried over from older runs get the eligibility check and the current scale", async () => {
  const { rescore } = await import("../lib/rank.js");
  const old = { source: "x", url: "https://x.com/s/status/1", title: "Join women-only hackathon for AI solutions", payout_amount_usd: 1500, deadline: "2026-11-08", effort_score: 40, decision_notes: ["parsed payout amount: $100"], score: 77 };
  const fresh = rescore(old, now);
  assert.equal(fresh.restricted, "women only");
  assert.ok(fresh.score < 77);
  assert.ok(!fresh.decision_notes.some((n) => n.startsWith("parsed payout amount")));
});

import { priceFromLabels, isPayingIssue } from "../lib/rank.js";

test("devpool price labels become the reward", () => {
  assert.equal(priceFromLabels(["Priority: 2 (Medium)", "Price: 150 USD", "Time: <2 Hours"]), 150);
  assert.equal(priceFromLabels(["Price: 1,200 USDC"]), 1200);
  assert.equal(priceFromLabels(["enhancement"]), null);
});

test("only issues that actually pay stay in the feed", () => {
  // labelled bounties and priced tickets stay
  assert.ok(isPayingIssue({ title: "Frantic bounty #145", labels: ["bounty", "funded"], signals: ["bounty"] }));
  assert.ok(isPayingIssue({ title: "Cow Swap Cash Out", labels: ["Price: 600 USD"], signals: ["amount"] }));
  assert.ok(isPayingIssue({ title: "Hermes: attack and test the live pool", labels: [], signals: ["bounty", "amount", "payout address"], amountUsd: 100 }));
  assert.ok(isPayingIssue({ title: "[BOUNTY] Medium: Missing init_asset_vault", labels: [], signals: ["bounty", "amount"], amountUsd: 150 }));
  assert.equal(isPayingIssue({ title: "fix(router): prevent sequential TAKE_PORTION compounding", labels: ["bounty"], signals: ["bounty", "amount", "payout address"], amountUsd: 15000 }), false);
  // body mentions bounty + amount but no payout address: work ticket
  assert.equal(isPayingIssue({ title: "Steward's page: where the lab is", labels: [], signals: ["bounty", "USDC/Base", "amount"], amountUsd: 332 }), false);
  // work tickets that merely mention the word go
  assert.equal(isPayingIssue({ title: "Epic: Week 10 – Deploy Forseti to GCP", labels: [], signals: ["amount"], amountUsd: 9 }), false);
  assert.equal(isPayingIssue({ title: "Codex task queue", labels: [], signals: ["bounty"] }), false);
  assert.equal(isPayingIssue({ title: "v1 follow-ups from A4", labels: ["enhancement", "status:ready"], signals: ["MRWK/MergeWork"] }), false);
  assert.equal(isPayingIssue({ title: "RFC: Federation bridge to mergework", labels: ["triaged"], signals: ["bounty", "amount"], amountUsd: null }), false);
});

import { capPerRepo } from "../lib/rank.js";

test("aggregator repos keep at most two items", () => {
  const items = [1, 2, 3, 4].map((k) => ({ source: "github", repo: "x/bounty-plaza", url: `u${k}`, score: 60 - k }))
    .concat([{ source: "x", repo: "@a", url: "x1" }, { repo: "y/other", url: "g1" }]);
  const out = capPerRepo(items);
  assert.equal(out.filter((i) => i.repo === "x/bounty-plaza").length, 2);
  assert.equal(out.length, 4);
});
