// Rules check: for the top few contests found on X/Reddit, open the rules page the post links to
// (buy browser session), and have the model read the real deadline, prize and eligibility from it.
// A post says "$5k hackathon, link below"; the rules page says whether it closed yesterday.
import { toIsoDate, rescore } from "./rank.js";

// Links that are not rules pages: social posts, media, shorteners we couldn't expand, wallets.
const NOT_RULES = /(^|\.)(x\.com|twitter\.com|t\.co|reddit\.com|redd\.it|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|facebook\.com|t\.me|discord\.gg|discord\.com|linktr\.ee|bit\.ly|pump\.fun|dexscreener\.com|etherscan\.io|basescan\.org|solscan\.io)$/i;
// Hosts that put up a bot check in buy's browser (tested Nov 3 2026): skip to the next link.
const BOT_WALLED = /(^|\.)(dorahacks\.io|devpost\.com)$/i;
// Hosts that usually ARE the rules page; preferred when a post links several.
const RULES_HOSTS = /(luma\.com|lu\.ma|devfolio\.co|hacklist\.io|apartresearch\.com|gleam\.io|taikai\.network|akindo\.io|superteam\.fun|earn\.superteam|layer3\.xyz|galxe\.com|zealy\.io|questn\.com|hackquest\.io|ethglobal\.com|notion\.site|medium\.com|mirror\.xyz|paragraph\.(xyz|com)|substack\.com|gitbook\.io|github\.com|loops\.house|poidh\.xyz|rally\.fun|kaito\.ai|wallchain\.xyz)$/i;

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

/** Follow one t.co short link to where it points, without loading the page (free; no paid call). */
export async function unshorten(url, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(8_000), headers: { "user-agent": "curl/8" } });
    const loc = res.headers?.get?.("location");
    if (loc) return new URL(loc, url).href;
    const html = await res.text();
    const m = html.match(/URL=([^"'>\s]+)/i) || html.match(/location\.replace\(["']([^"']+)/i);
    return m ? new URL(m[1].replace(/\\\//g, "/"), url).href : null;
  } catch {
    return null;
  }
}

const tweetId = (url) => /\/status\/(\d+)/.exec(url)?.[1] ?? null;

async function unwrapAll(text, resolve, max) {
  for (const sh of [...new Set([...text.matchAll(/https:\/\/t\.co\/\w+/g)].map((m) => m[0]))].slice(0, max)) {
    const long = await resolve(sh);
    if (long) text = text.replaceAll(sh, long);
  }
  return text;
}

/**
 * For the top n social posts, what to read: the contest's rules page when the post links one, otherwise the
 * full post (X search returns ~280 characters; fullPost fetches the long text, paid). Returns
 * [{ item, kind: "page", url }] or [{ item, kind: "post", url, text }].
 */
export async function pickTargets(items, cands, n = 3, resolve = unshorten, fullPost = null) {
  const textByUrl = new Map(cands.map((c) => [c.url, c.text || ""]));
  const out = [];
  let looked = 0;
  for (const item of [...items].sort((a, b) => b.score - a.score)) {
    if (!["x", "reddit"].includes(item.source)) continue;
    if (++looked > n * 3) break;
    const short = await unwrapAll(textByUrl.get(item.url) || "", resolve, 3);
    // A bare homepage ("hacklist.io/") is a directory, not this contest's rules: prefer a deep link or the full post.
    const deep = (t) => rulesLinks(t).find((u) => new URL(u).pathname.length > 1);
    let url = deep(short);
    let full = null;
    if (!url && fullPost && item.source === "x" && tweetId(item.url)) {
      full = await fullPost(tweetId(item.url)).catch(() => null);
      if (full) {
        full = await unwrapAll(full, resolve, 5);
        url = deep(full);
      }
    }
    if (url) out.push({ item, kind: "page", url });
    else if (full && full.length > short.length + 80) out.push({ item, kind: "post", url: item.url, text: full });
    if (out.length >= n) break;
  }
  return out;
}

export function buildRulesPrompt(pages, today = new Date().toISOString().slice(0, 10)) {
  const body = pages.map((p, i) => `### Page ${i} (${p.kind === "post" ? "the full announcement post" : "linked rules page"})\nURL: ${p.url}\nThe post said: ${p.item.title}\n\n${p.text.slice(0, 5000)}`).join("\n\n");
  return [
    {
      role: "system",
      content: `You check crypto contest and bounty rules pages. Today is ${today}. For each page, reply with one JSON object per line and nothing else:
{"i": <page number>, "is_rules": true|false, "closed": true|false, "deadline": "YYYY-MM-DD" or null, "prizeUsd": <total prize pool in USD> or null, "restricted": "<who can't enter, e.g. 'holders only', 'US excluded', 'women only'>" or null}
is_rules=false if the page is not about this contest (login wall, unrelated page, error). A full announcement post counts as being about the contest. closed=true only if the page says submissions have ended or winners were announced. Use only what the page states; never guess.`,
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
export function applyRules(item, url, r, now = Date.now(), kind = "page") {
  if (!r || r.is_rules !== true) return item;
  if (r.closed === true) return null;
  const next = { ...item, rules_checked_at: new Date(now).toISOString() };
  if (kind === "page") next.rules_url = url;
  else next.full_post_read = true;
  const notes = [kind === "page" ? `rules page read: ${new URL(url).hostname}` : "full announcement post read"];
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
  const stale = (n) => (next.deadline !== item.deadline && /^deadline \d{4}-\d{2}-\d{2}/.test(n));
  next.decision_notes = [...notes, ...(item.decision_notes ?? []).filter((n) => !stale(n)).filter((n) => !/^prize used for ranking/.test(n) || !notes.some((x) => x.startsWith("prize from")))].slice(0, 6);
  return rescore(next, now);
}

/**
 * Read up to n rules pages in one paid browser session, then one model call to extract the facts.
 * Returns { items, checked } where items has updates applied (closed contests removed).
 */
export async function checkRules(session, items, cands, { n = 3, errors = [], log = () => {}, resolve = unshorten } = {}) {
  const fullPost = session.tweetDetail
    ? async (id) => {
        try {
          const { json } = await session.tweetDetail(id);
          return typeof json?.output?.text === "string" ? json.output.text : null;
        } catch (e) {
          errors.push(`tweet detail: ${String(e.message).replace(/https?:\/\/\S+/g, "<url>").slice(0, 80)}`);
          return null;
        }
      }
    : null;
  const targets = await pickTargets(items, cands, n, resolve, fullPost);
  log(`rules targets ${targets.length} (${targets.filter((t) => t.kind === "page").length} pages)`);
  if (!targets.length) return { items, checked: [] };
  const pages = targets.filter((t) => t.kind === "post");
  const toOpen = targets.filter((t) => t.kind === "page");
  if (toOpen.length) {
    let browser;
    try {
      browser = await session.browser(3);
      for (const t of toOpen) {
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
  }
  log(`rules read ${pages.length}/${targets.length}`);
  if (!pages.length) return { items, checked: [] };
  let parsed = new Map();
  try {
    const { json } = await session.chat(buildRulesPrompt(pages), 800);
    parsed = parseRules(json?.choices?.[0]?.message?.content || "");
  } catch (e) {
    errors.push(`rules model: ${String(e.message).slice(0, 80)}`);
    return { items, checked: [] };
  }
  const byUrl = new Map(pages.map((p, i) => [p.item.url, { url: p.url, kind: p.kind, r: parsed.get(i) }]));
  const checked = [];
  const next = [];
  for (const it of items) {
    const hit = byUrl.get(it.url);
    if (!hit) { next.push(it); continue; }
    const up = applyRules(it, hit.url, hit.r, Date.now(), hit.kind);
    checked.push({ url: it.url, read: hit.kind, rules_url: hit.kind === "page" ? hit.url : null, closed: up === null, about_contest: hit.r?.is_rules === true });
    if (up) next.push(up);
  }
  return { items: next.sort((a, b) => b.score - a.score), checked };
}
