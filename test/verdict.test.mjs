import test from "node:test";
import assert from "node:assert/strict";
import { decide, servRequest, RULES } from "../lib/verdict.js";
import { htmlToText, tweetIdOf } from "../lib/contest-text.js";

const TEXT = "Win $2,000 USDC. Build an agent on SERV Reasoning. Judged on creativity and revenue potential. Submit by Nov 15 23:59 UTC.";
const check = (id, result, evidence = "", why = "x") => ({ id, result, evidence, why });

test("hard rule failing forces SKIP whatever the soft rules say", () => {
  const raw = { contest: "c", prize_usd: 2000, hours: 4, odds_pct: 20, summary: "",
    checks: [check("open", "pass", "Submit by Nov 15"), check("safe", "fail", "Win $2,000 USDC"), ...RULES.slice(2).map((r) => check(r.id, "pass", "Judged on creativity"))] };
  const v = decide(raw, TEXT);
  assert.equal(v.verdict, "SKIP");
  assert.match(v.decided_by, /No scam signals/);
});

test("evidence not in the text is downgraded to unknown", () => {
  const raw = { prize_usd: 2000, hours: 4, odds_pct: 20, checks: [check("prize", "pass", "escrowed on poidh")] };
  const v = decide(raw, TEXT);
  const p = v.checks.find((c) => c.id === "prize");
  assert.equal(p.result, "unknown");
  assert.equal(p.grounded, false);
});

test("EV is recomputed by code, not trusted from the model", () => {
  const raw = { prize_usd: 100, hours: 10, odds_pct: 10, checks: [check("ev", "pass", "")] };
  const v = decide(raw, TEXT);
  assert.equal(v.ev_per_hour, 1);
  assert.equal(v.checks.find((c) => c.id === "ev").result, "fail");
});

test("strong contest with grounded evidence -> ENTER", () => {
  const raw = { prize_usd: 2000, hours: 5, odds_pct: 15, summary: "s", checks: [
    check("open", "pass", "Submit by Nov 15 23:59 UTC"), check("safe", "pass", "Build an agent"), check("eligible", "pass", "Build an agent on SERV Reasoning"),
    check("prize", "pass", "Win $2,000 USDC"), check("judging", "pass", "Judged on creativity and revenue potential"), check("crowd", "unknown"),
    check("fit", "pass", "Build an agent"), check("ev", "pass")] };
  assert.equal(decide(raw, TEXT).verdict, "ENTER");
});

test("request uses SERV features: guard, shadow agent, kronos+multipath, schema", () => {
  const b = servRequest(TEXT, { now: new Date("2026-11-15T00:00:00Z") });
  assert.match(b.model, /-serv-kronos-multipath$/);
  const names = b.tools.map((t) => t.function.name);
  assert.deepEqual(names, ["serv_prompt_guard", "serv_shadow_agent"]);
  assert.equal(b.response_format.type, "json_schema");
  assert.match(b.messages[0].content, /untrusted/);
  assert.match(b.messages[1].content, /^<contest>/);
});

test("contest text helpers", () => {
  assert.equal(tweetIdOf("https://x.com/openservai/status/2121634976408174606?s=20"), "2121634976408174606");
  assert.equal(htmlToText("<p>Prize <b>$5k</b></p><script>x()</script>"), "Prize $5k");
});
