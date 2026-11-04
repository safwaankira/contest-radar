import test from "node:test";
import assert from "node:assert/strict";
import { rulesLinks, pickTargets, parseRules, applyRules, buildRulesPrompt } from "../lib/rules.js";

const NOW = Date.parse("2026-11-04T00:00:00Z");

test("rules links skip social and media links and prefer contest platforms", () => {
  const t = "Big hackathon! https://x.com/a/status/1 details: https://example.com/blog, register https://lu.ma/abc. https://t.co/xyz";
  assert.deepEqual(rulesLinks(t), ["https://lu.ma/abc", "https://example.com/blog"]);
  // bot-walled in buy's browser: skipped
  assert.deepEqual(rulesLinks("https://dorahacks.io/hackathon/x https://devpost.com/y"), []);
  assert.deepEqual(rulesLinks("no links"), []);
  assert.deepEqual(rulesLinks("http://insecure.com only"), []);
});

test("targets are the top social items that link a rules page", async () => {
  const items = [
    { source: "x", url: "https://x.com/a/status/1", score: 80 },
    { source: "poidh", url: "https://poidh.xyz/base/bounty/1", score: 90 },
    { source: "x", url: "https://x.com/b/status/2", score: 70 },
    { source: "reddit", url: "https://www.reddit.com/r/x/1", score: 60 },
  ];
  const cands = [
    { url: "https://x.com/a/status/1", text: "see https://lu.ma/ev1" },
    { url: "https://x.com/b/status/2", text: "no link here" },
    { url: "https://www.reddit.com/r/x/1", text: "rules https://gleam.io/abc" },
  ];
  const t = await pickTargets(items, cands, 3, async () => null);
  assert.deepEqual(t.map((x) => x.url), ["https://lu.ma/ev1", "https://gleam.io/abc"]);
});

test("model lines parse into a map by page", () => {
  const m = parseRules('{"i":0,"is_rules":true,"closed":false,"deadline":"2026-11-20","prizeUsd":5000,"restricted":null}\njunk\n{"i":1,"is_rules":false}');
  assert.equal(m.size, 2);
  assert.equal(m.get(0).prizeUsd, 5000);
});

test("rules page updates deadline and prize, drops closed contests, ignores non-rules pages", () => {
  const item = { source: "x", url: "https://x.com/a/status/1", title: "Hackathon", score: 50, deadline: "2026-11-10", payout_amount_usd: 1000, amount_usd: 1000, effort_score: 40, text_score: 20, decision_notes: ["prize used for ranking: $1000"] };
  const up = applyRules(item, "https://lu.ma/ev1", { i: 0, is_rules: true, closed: false, deadline: "2026-11-25", prizeUsd: 5000, restricted: null }, NOW);
  assert.equal(up.deadline, "2026-11-25");
  assert.equal(up.payout_amount_usd, 5000);
  assert.equal(up.rules_url, "https://lu.ma/ev1");
  assert.ok(up.decision_notes[0].startsWith("rules page read"));
  assert.ok(up.score > 0);
  assert.equal(applyRules(item, "https://lu.ma/ev1", { is_rules: true, closed: true }, NOW), null);
  assert.equal(applyRules(item, "https://lu.ma/ev1", { is_rules: false, closed: true }, NOW), item);
  const r = applyRules(item, "https://lu.ma/ev1", { is_rules: true, closed: false, restricted: "US residents only" }, NOW);
  assert.equal(r.restricted, "US residents only");
  const plain = applyRules(item, "https://lu.ma/ev1", { is_rules: true, closed: false }, NOW);
  assert.equal(plain.score - r.score, 8);
});

test("prompt carries each page's text, capped", () => {
  const [sys, user] = buildRulesPrompt([{ url: "https://lu.ma/x", item: { title: "T" }, text: "a".repeat(9000) }], "2026-11-04");
  assert.match(sys.content, /2026-11-04/);
  assert.ok(user.content.length < 5300);
});

test("checkRules reads pages in one browser session, closes it, and applies the model's reading", async () => {
  const calls = [];
  const browser = { read: async (u) => (calls.push(`read ${u}`), "Rules. Submissions close 2026-11-30. Prize pool $3,000. ".repeat(10)), close: async () => (calls.push("close"), true) };
  const session = {
    browser: async (m) => (calls.push(`open ${m}min`), browser),
    chat: async () => ({ json: { choices: [{ message: { content: '{"i":0,"is_rules":true,"closed":false,"deadline":"2026-11-30","prizeUsd":3000,"restricted":null}' } }] } }),
  };
  const items = [{ source: "x", url: "https://x.com/a/status/1", title: "Contest", score: 40, deadline: null, payout_amount_usd: null, effort_score: 40, text_score: 10 }];
  const cands = [{ url: "https://x.com/a/status/1", text: "rules https://lu.ma/c1" }];
  const { checkRules } = await import("../lib/rules.js");
  const r = await checkRules(session, items, cands, { n: 3, resolve: async () => null });
  assert.deepEqual(calls, ["open 3min", "read https://lu.ma/c1", "close"]);
  assert.equal(r.items[0].deadline, "2026-11-30");
  assert.equal(r.items[0].payout_amount_usd, 3000);
  assert.equal(r.checked.length, 1);
});

test("t.co links in X posts are unwrapped before picking the rules page", async () => {
  const items = [{ source: "x", url: "https://x.com/a/status/1", score: 80 }];
  const cands = [{ url: "https://x.com/a/status/1", text: "Hackathon $5k https://t.co/abc123 https://t.co/img999" }];
  const map = { "https://t.co/abc123": "https://lu.ma/event1", "https://t.co/img999": "https://x.com/a/status/1/photo/1" };
  const t = await pickTargets(items, cands, 3, async (u) => map[u] ?? null);
  assert.deepEqual(t.map((x) => x.url), ["https://lu.ma/event1"]);
});

test("unshorten reads the redirect target without following it", async () => {
  const { unshorten } = await import("../lib/rules.js");
  const fake = async () => ({ headers: { get: (h) => (h === "location" ? "https://lu.ma/x" : null) }, text: async () => "" });
  assert.equal(await unshorten("https://t.co/a", fake), "https://lu.ma/x");
  const meta = async () => ({ headers: { get: () => null }, text: async () => '<meta http-equiv="refresh" content="0;URL=https://gleam.io/y">' });
  assert.equal(await unshorten("https://t.co/b", meta), "https://gleam.io/y");
  assert.equal(await unshorten("https://t.co/c", async () => { throw new Error("down"); }), null);
});
