// Rules check: for the top few contests found on X/Reddit, open the rules page the post links to
// (buy browser session), and have the model read the real deadline, prize and eligibility from it.
// A post says "$5k hackathon, link below"; the rules page says whether it closed yesterday.
import { toIsoDate, rescore } from "./rank.js";

// Links that are not rules pages: social posts, media, shorteners we couldn't expand, wallets.
const NOT_RULES = /(^|\.)(x\.com|twitter\.com|t\.co|reddit\.com|redd\.it|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|facebook\.com|t\.me|discord\.gg|discord\.com|linktr\.ee|bit\.ly|pump\.fun|dexscreener\.com|etherscan\.io|basescan\.org|solscan\.io)$/i;
// Hosts that put up a bot check in buy's browser (tested Nov 3 2026): skip to the next link.
const BOT_WALLED = /(^|\.)(dorahacks\.io|devpost\.com)$/i;
// Hosts that usually ARE the rules page; preferred when a post links several.
const RULES_HOSTS = /(luma\.com|lu\.ma|devfolio\.co|gleam\.io|taikai\.network|akindo\.io|superteam\.fun|earn\.superteam|layer3\.xyz|galxe\.com|zealy\.io|questn\.com|hackquest\.io|ethglobal\.com|notion\.site|medium\.com|mirror\.xyz|paragraph\.(xyz|com)|substack\.com|gitbook\.io|github\.com|loops\.house|poidh\.xyz|rally\.fun|kaito\.ai|wallchain\.xyz)$/i;

/** Outbound https links in a post that could be its rules page, best first. */
export function rulesLinks(text = "") {
  const out = [];
  for (const m of String(text).matchAll(/https:\/\/[^\s)"'<>\]]+/g)) {
    let u;
    try { u = new URL(m[0].replace(/[.,;:!?]+$/, "")); } catch { continue; }
    if (NOT_RULES.test(u.hostname) || BOT_WALLED.test(u.hostname)) continue;
    if (!out.some((x) => x.href === u.href)) out.push(u);
  }
  return out.sort((a, b) => Number(RULES_HOSTS.test(b.hostname)) - Number(RULES_HOSTS.test(a.hostname))).map((u) => u.href);
}

/** The top n social items that link a rules page: [{ item, url }]. cands carry the post text. */
export function pickTargets(items, cands, n = 3) {
  const textByUrl = new Map(cands.map((c) => [c.url, c.text || ""]));
  const out = [];
  for (const item of [...items].sort((a, b) => b.score - a.score)) {
    if (!["x", "reddit"].includes(item.source)) continue;
    const url = rulesLinks(textByUrl.get(item.url))[0];
    if (url) out.push({ item, url });
    if (out.length >= n) break;
  }
  return out;
}

export function buildRulesPrompt(pages, today = new Date().toISOString().slice(0, 10)) {
  const body = pages.map((p, i) => `### Page ${i}\nURL: ${p.url}\nThe post said: ${p.item.title}\n\n${p.text.slice(0, 5000)}`).join("\n\n");
  return [
    {
      role: "system",
      content: `You check crypto contest and bounty rules pages. Today is ${today}. For each page, reply with one JSON object per line and nothing else:
{"i": <page number>, "is_rules": true|false, "closed": true|false, "deadline": "YYYY-MM-DD" or null, "prizeUsd": <total prize pool in USD> or null, "restricted": "<who can't enter, e.g. 'holders only', 'US excluded', 'women only'>" or null}
is_rules=false if the page is not about this contest (login wall, unrelated page, error). closed=true only if the page says submissions have ended or winners were announced. Use only what the page states; never guess.`,
    },
    { role: "user", content: body },
  ];
}

export function parseRules(content = "") {
  const out = new Map();
  for (const line of String(content).split("\n")) {
    const m = line.match(/\{.*\}/);
    if (!m) continue;
    try {
      const o = JSON.parse(m[0]);
      if (Number.isInteger(o.i)) out.set(o.i, o);
    } catch { /* skip */ }
  }
  return out;
}

/**
 * Apply what a rules page said to the item. Returns the updated item, or null when the page says the
 * contest has closed (it leaves the feed). Pages that weren't the rules leave the item unchanged.
 */
export function applyRules(item, url, r, now = Date.now()) {
  if (!r || r.is_rules !== true) return item;
  if (r.closed === true) return null;
  const next = { ...item, rules_url: url, rules_checked_at: new Date(now).toISOString() };
  const notes = [`rules page read: ${new URL(url).hostname}`];
  const deadline = typeof r.deadline === "string" ? toIsoDate(r.deadline) : null;
  if (deadline && deadline !== item.deadline) {
    notes.push(`deadline from rules page: ${deadline}${item.deadline ? ` (post said ${item.deadline})` : ""}`);
    next.deadline = deadline;
  }
  const prize = Number(r.prizeUsd);
  if (Number.isFinite(prize) && prize > 0 && prize <= 100000) {
    if (prize !== item.payout_amount_usd) notes.push(`prize from rules page: $${prize}`);
    next.payout_amount_usd = prize;
    next.amount_usd = prize;
  }
  if (typeof r.restricted === "string" && r.restricted.trim()) next.restricted = r.restricted.trim().slice(0, 60);
  next.decision_notes = [...notes, ...(item.decision_notes ?? []).filter((n) => !/^prize used for ranking/.test(n) || !notes.some((x) => x.startsWith("prize from")))].slice(0, 6);
  return rescore(next, now);
}

/**
 * Read up to n rules pages in one paid browser session, then one model call to extract the facts.
 * Returns { items, checked } where items has updates applied (closed contests removed).
 */
export async function checkRules(session, items, cands, { n = 3, errors = [], log = () => {} } = {}) {
  const targets = pickTargets(items, cands, n);
  if (!targets.length) return { items, checked: [] };
  let browser;
  const pages = [];
  try {
    browser = await session.browser(3);
    for (const t of targets) {
      try {
        const text = await browser.read(t.url);
        if (text.trim().length > 200) pages.push({ ...t, text });
      } catch (e) {
        errors.push(`rules page ${new URL(t.url).hostname}: ${String(e.message).slice(0, 80)}`);
      }
    }
  } catch (e) {
    errors.push(`browser: ${String(e.message).replace(/https?:\/\/\S+/g, "<url>").slice(0, 120)}`);
    if (e.paid) errors.push("browser session was paid but failed; not retried");
  } finally {
    if (browser && !(await browser.close())) errors.push("browser session did not confirm close (it expires on its own)");
  }
  log(`rules pages read ${pages.length}/${targets.length}`);
  if (!pages.length) return { items, checked: [] };
  let parsed = new Map();
  try {
    const { json } = await session.chat(buildRulesPrompt(pages), 800);
    parsed = parseRules(json?.choices?.[0]?.message?.content || "");
  } catch (e) {
    errors.push(`rules model: ${String(e.message).slice(0, 80)}`);
    return { items, checked: [] };
  }
  const byUrl = new Map(pages.map((p, i) => [p.item.url, { url: p.url, r: parsed.get(i) }]));
  const checked = [];
  const next = [];
  for (const it of items) {
    const hit = byUrl.get(it.url);
    if (!hit) { next.push(it); continue; }
    const up = applyRules(it, hit.url, hit.r);
    checked.push({ url: it.url, rules_url: hit.url, closed: up === null, is_rules: hit.r?.is_rules === true });
    if (up) next.push(up);
  }
  return { items: next.sort((a, b) => b.score - a.score), checked };
}
