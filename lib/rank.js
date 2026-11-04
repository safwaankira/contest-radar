/**
 * Turn raw candidates (poidh, X, Reddit) into feed items in bounty-radar's schema.
 *
 * - The model only reads: is it enterable, prize, deadline, effort, what to submit.
 * - Scoring is bounty-radar's text scorer (payout signals, rails, risk flags, effort,
 *   opportunity class), plus two things social contests need: a deadline window and a
 *   "crowded" flag for how much competition an entry already has (after open-bounty-radar).
 * Same inputs, same ranking: no model output decides the score directly.
 */
import { scoreText } from "../scripts/scoring.mjs";
import { findDeadline } from "./dates.js";

const KINDS = ["thread", "meme", "art", "video", "code", "research", "data", "other"];
const BODY_LIMIT = 30_000; // Cencori refuses request bodies over 32 KiB

const ENTRY_WORDS = /(submit|submission|enter|entries|deadline|winner|claim|apply|reply with|quote|post your|tag us|judg)/i;
const PRIZE_WORDS = /(\$\s?\d|\d+\s?(usdc|usdt|usd|eth|sol|celo|k\b)|prize|reward|bounty|pool)/i;

/** Cheap filter before paying for the model: must look like an announcement with a prize. */
export function prefilter(cands, max = 45) {
  return cands
    .filter((c) => c.source === "poidh" || (ENTRY_WORDS.test(c.text + " " + (c.title || "")) && PRIZE_WORDS.test(c.text + " " + (c.title || ""))))
    .slice(0, max);
}

export function buildPrompt(cands, today = new Date()) {
  const lines = cands.map((c, i) =>
    JSON.stringify({ i, src: c.source, by: c.author, at: c.postedAt?.slice(0, 10), title: c.title || undefined, prize: c.prizeHint || undefined, text: c.text.replace(/\s+/g, " ").slice(0, 420) })
  );
  const system =
    "You read social posts and bounty listings and decide which ones are OPEN opportunities a person can enter right now to win money " +
    "(bounties, contests, hackathons, writing/meme/art/video challenges). Ignore: people asking for help, scams, airdrop farming, giveaways that only need a like/follow/retweet, job ads, results announcements, and anything already closed. " +
    `Today is ${today.toISOString().slice(0, 10)}. Output ONLY JSON lines, one per opportunity, no prose, no code fences. ` +
    `Each line: {"i":<index>,"kind":one of ${JSON.stringify(KINDS)},"prize":"<as written, short>","prizeUsd":<number or null>,"deadline":"YYYY-MM-DD or null",` +
    '"effort":"low|medium|high","task":"<what to submit, max 14 words>","name":"<sponsor or project, max 4 words>",' +
    '"restricted":"<who may enter if limited, e.g. women only, US only, students, holders only; else null>"}. ' +
    "prizeUsd: total prize in US dollars if stated (ETH at 2500, SOL at 150), else null. Skip non-opportunities entirely.";
  let user = lines.join("\n");
  while (JSON.stringify({ system, user }).length > BODY_LIMIT - 1500) {
    lines.pop();
    user = lines.join("\n");
  }
  return { messages: [{ role: "system", content: system }, { role: "user", content: user }], used: lines.length };
}

export function parseModel(content) {
  const out = new Map();
  for (const raw of String(content || "").split("\n")) {
    const line = raw.trim().replace(/^```(json)?|```$/g, "").replace(/,$/, "");
    if (!line.startsWith("{")) continue;
    try {
      const o = JSON.parse(line);
      if (Number.isInteger(o.i)) out.set(o.i, o);
    } catch { /* skip malformed line */ }
  }
  return out;
}

/**
 * One scale for every source (0–100). What makes something worth entering, in order:
 * prize (0–40, log), time left (0–20), effort (0–15), trust (0–10), payout clarity from
 * bounty-radar's text score (0–10, capped so it can't dominate), minus competition and staleness.
 */
export function worthScore({ prizeUsd = null, timing = 8, effortScore = 50, trust = 5, clarity = 0, crowded = false, stale = false, avoid = false }) {
  if (avoid) return 0;
  const prizePts = prizeUsd ? Math.min(40, Math.round(13.3 * Math.log10(prizeUsd + 1))) : 5;
  const effortPts = Math.round(((100 - Math.min(100, Math.max(0, effortScore))) / 100) * 15);
  const clarityPts = Math.round((Math.min(60, Math.max(0, clarity)) / 60) * 10);
  return Math.max(0, Math.min(100, prizePts + timing + effortPts + trust + clarityPts - (crowded ? 10 : 0) - (stale ? 12 : 0)));
}

/** "$8,000 in cash", "5,200 USDT", "$1.5k", "0.05 ETH" -> dollars (largest amount stated), or null. */
export function parsePrize(text = "") {
  const vals = [];
  const re = /(\$)\s?([\d,]+(?:\.\d+)?)\s?(k|m)?\b|([\d,]+(?:\.\d+)?)\s?(k|m)?\s?(usdc|usdt|usd|dollars|eth|sol)\b/gi;
  for (const m of String(text).matchAll(re)) {
    const n = Number((m[2] || m[4]).replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    const mult = /k/i.test(m[3] || m[5] || "") ? 1e3 : /m/i.test(m[3] || m[5] || "") ? 1e6 : 1;
    const unit = (m[6] || "").toLowerCase();
    const rate = unit === "eth" ? 2500 : unit === "sol" ? 150 : 1;
    vals.push(n * mult * rate);
  }
  const ok = vals.filter((v) => v > 0 && v <= 100000);
  return ok.length ? Math.max(...ok) : null;
}

/** Common eligibility limits the model can miss. Returns a short label or null. */
export function eligibilityFromText(text = "") {
  const rules = [
    [/\bwomen[- ]only\b|\bfor women\b|\bfemale (?:founders|builders|creators) only\b|\bwomen in (?:web3|crypto|tech)\b/i, "women only"],
    [/\bstudents? only\b|\bopen to students\b|\buniversity students\b/i, "students only"],
    [/\b(?:us|u\.s\.) (?:residents|citizens|only)\b/i, "US only"],
    [/\b(?:holders?|nft holders?) only\b|\bmust hold\b/i, "holders only"],
    [/\binvite[- ]only\b|\bwhitelist(?:ed)? only\b|\bby invitation\b/i, "invite only"],
    [/\b(?:nigeria|india|kenya|argentina|brazil|africa|latam)[- ](?:based|residents|only)\b/i, "region limited"],
  ];
  for (const [re, label] of rules) if (re.test(text)) return label;
  return null;
}

/** Points for timing: closing in 2–10 days is the sweet spot; null = closed. */
export function deadlinePoints(deadline, now = Date.now()) {
  if (!deadline) return 8;
  const days = (Date.parse(`${deadline}T23:59:59Z`) - now) / 864e5;
  if (days < 0) return null;
  if (days < 0.5) return 4;
  if (days < 2) return 14;
  if (days < 10) return 20;
  return 12;
}

/** Competition: an entry that is already crowded is worth less of your time. */
export function isCrowded(c) {
  const s = c.signals || {};
  return Boolean(s.hasClaims && s.voting) || (s.replies ?? 0) > 60 || (s.comments ?? 0) > 80;
}

/** One candidate + what the model read from it -> one feed item in bounty-radar's schema. */
export function toItem(c, m = {}, now = Date.now()) {
  const deadline = validDate(m.deadline) || validDate(c.deadline);
  // A social post with no stated deadline is less certain than an escrowed bounty with none.
  const timing = !deadline && c.source !== "poidh" ? 4 : deadlinePoints(deadline, now);
  if (timing === null) return null; // closed

  if (!/^https:\/\//i.test(c.url || "")) return null; // links come from third-party feeds
  // poidh's escrowed amount is exact. Otherwise take the larger of the model's number and what its own
  // prize text says ("$8,000 in cash prizes" read as 4000 becomes 8000), capped at a plausible size.
  const modelPrize = Number.isFinite(m.prizeUsd) && m.prizeUsd > 0 && m.prizeUsd <= 100000 ? m.prizeUsd : null;
  const textPrize = parsePrize(m.prize);
  const prizeUsd = c.prizeUsd ?? (modelPrize || textPrize ? Math.max(modelPrize ?? 0, textPrize ?? 0) : null);
  const modelRestricted = typeof m.restricted === "string" && m.restricted.trim() && !/^(null|none|no|open|anyone)$/i.test(m.restricted.trim()) ? m.restricted.trim().slice(0, 40) : null;
  const restricted = modelRestricted || eligibilityFromText(`${c.title || ""} ${c.text}`);
  const kind = KINDS.includes(m.kind) ? m.kind : "other";
  const extraSignals = [`source:${c.source}`];
  if (c.source === "poidh") extraSignals.push("escrowed onchain");
  // When the model read a prize the regexes would miss (e.g. "0.05 ETH"), state it so the scorer sees it.
  const body = prizeUsd && !/\$\s?\d/.test(c.text) ? `${c.text}\nreward: $${Math.round(prizeUsd)}` : c.text;

  const base = scoreText({ title: c.title || m.task || "", body, labels: [kind, c.source], updatedAt: c.postedAt, extraSignals });
  const crowded = isCrowded(c);
  const trust = c.source === "poidh" ? 10 : c.signals?.verified || (c.signals?.followers ?? 0) > 5000 ? 8 : (c.signals?.followers ?? 0) < 200 && c.source === "x" ? 1 : 5;
  // The model's effort read nudges bounty-radar's effort score.
  const effortScore = Math.min(100, Math.max(0, base.effort_score + (m.effort === "low" ? -15 : m.effort === "high" ? 15 : 0)));
  // Open for weeks with no stated deadline: probably forgotten or already decided off-platform.
  const ageDays = c.postedAt ? (now - Date.parse(c.postedAt)) / 864e5 : 0;
  const stale = !deadline && ageDays > 21;
  const score = Math.max(0, worthScore({
    prizeUsd: prizeUsd ?? base.payout_amount_usd ?? null,
    timing, effortScore, trust, clarity: base.score, crowded, stale,
    avoid: base.opportunity_class === "avoid",
  }) - (restricted ? 8 : 0)); // fewer people can enter

  return {
    ...base,
    score,
    text_score: base.score,
    effort_score: effortScore,
    source: c.source,
    preset: c.source,
    preset_name: { poidh: "poidh bounties", x: "X contests", reddit: "Reddit" }[c.source] || c.source,
    repo: c.source === "poidh" ? `poidh/${c.signals?.chain || "?"}` : c.author || c.source,
    title: c.title || m.task || c.text.slice(0, 90),
    url: c.url,
    updated_at: c.postedAt,
    amount_usd: prizeUsd ?? base.amount_usd,
    payout_amount_usd: prizeUsd ?? base.payout_amount_usd,
    restricted,
    issuer: c.source === "poidh" ? c.author : undefined,
    timing_points: timing,
    trust_points: trust,
    prize_text: c.prizeHint || (m.prize ? String(m.prize).slice(0, 40) : null),
    deadline,
    kind,
    task: m.task ? String(m.task).slice(0, 120) : null,
    name: String(m.name || c.author || "").slice(0, 40),
    crowded,
    signals: [...base.signals, ...(crowded ? ["crowded"] : [])],
    decision_notes: [
      ...(deadline ? [`deadline ${deadline}`] : []),
      ...(crowded ? ["already crowded: many entries or replies"] : []),
      ...(stale ? [`open ${Math.round(ageDays)} days with no deadline`] : []),
      ...(prizeUsd ? [`prize used for ranking: $${Math.round(prizeUsd).toLocaleString("en-US")}`] : []),
      ...(restricted ? [`only open to: ${restricted}`] : []),
      // bounty-radar's own amount note came from a regex over the raw text; the line above supersedes it.
      ...base.decision_notes.filter((n) => !/^(parsed payout amount|no explicit)/.test(n)),
    ].slice(0, 6),
  };
}

export function assemble(cands, parsed, now = Date.now()) {
  const items = [];
  for (const [i, m] of parsed) {
    const c = cands[i];
    if (!c) continue;
    const item = toItem(c, m, now);
    if (item && item.score > 0) items.push(item);
  }
  return items.sort((a, b) => b.score - a.score);
}

function validDate(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s || "") ? s : null;
}

/** "November 30, 2026" or "2026-11-30" -> "2026-11-30", independent of the host timezone. */
export function toIsoDate(s) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(`${s.replace(",", "")} 00:00:00 UTC`);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/**
 * No model available: poidh bounties are structured enough to rank on their own, and social
 * posts survive only when they state a dollar prize outright.
 */
export function fallback(cands, now = Date.now()) {
  const parsed = new Map();
  cands.forEach((c, i) => {
    if (c.source === "poidh") {
      parsed.set(i, { i, deadline: c.deadline ?? findDeadline(c.text), effort: "medium" });
      return;
    }
    const m = c.text.match(/\$\s?([\d,]+(?:\.\d+)?)\s?(k\b)?|([\d,]+(?:\.\d+)?)\s?(usdc|usdt|usd)\b/i);
    if (!m) return;
    const n = Number((m[1] || m[3]).replace(/,/g, "")) * (m[2] ? 1000 : 1);
    if (!Number.isFinite(n) || n < 20) return;
    parsed.set(i, { i, prize: m[0].trim(), prizeUsd: n, effort: "medium" });
  });
  return assemble(cands, parsed, now);
}

/** Several identical bounties (e.g. "slot 1/4, 2/4…") become one row with a slot count. */
export function groupSlots(items) {
  const title = (i) => String(i.title).toLowerCase().replace(/\b(slot\s*)?\d+\s*\/\s*\d+\b/g, "").replace(/\s+/g, " ").trim();
  // poidh: same title from the same issuer is one bounty in several slots, even if the amounts differ.
  const key = (i) => (i.source === "poidh" ? `poidh|${title(i)}|${i.issuer ?? i.repo}` : `${i.source}|${title(i)}|${i.payout_amount_usd}`);
  const out = new Map();
  for (const i of items) {
    const k = key(i);
    const prev = out.get(k);
    if (!prev) out.set(k, { ...i, slots: 1 });
    else out.set(k, { ...(i.score > prev.score ? i : prev), slots: prev.slots + 1 });
  }
  return [...out.values()];
}

/** Re-score an item from its stored fields (used for items carried over from earlier runs). */
export function rescore(i, now = Date.now()) {
  const timing = !i.deadline && i.source !== "poidh" ? 4 : deadlinePoints(i.deadline, now);
  if (timing === null) return null;
  // Items saved before the eligibility check existed get it now (from their title and task).
  i = { ...i, restricted: i.restricted ?? eligibilityFromText(`${i.title} ${i.task ?? ""}`) };
  i.decision_notes = (i.decision_notes ?? []).filter((n) => !/^(parsed payout amount|no explicit)/.test(n));
  const ageDays = i.updated_at ? (now - Date.parse(i.updated_at)) / 864e5 : 0;
  const score = Math.max(0, worthScore({
    prizeUsd: i.payout_amount_usd ?? i.amount_usd ?? null,
    timing,
    effortScore: i.effort_score ?? 50,
    trust: i.trust_points ?? (i.source === "poidh" ? 10 : 5),
    clarity: i.text_score ?? 0,
    crowded: Boolean(i.crowded),
    stale: !i.deadline && ageDays > 21,
    avoid: i.opportunity_class === "avoid",
  }) - (i.restricted ? 8 : 0));
  return { ...i, score };
}

/** The same contest announced in several posts by one account: keep the best-scoring post. */
export function dedupeAnnouncements(items) {
  const best = new Map();
  for (const i of items) {
    const k = i.source === "x" || i.source === "reddit" ? `${i.source}|${String(i.repo).toLowerCase()}|${i.payout_amount_usd}|${i.deadline}` : i.url;
    const prev = best.get(k);
    if (!prev || i.score > prev.score) best.set(k, prev ? { ...i, also_posted: (prev.also_posted ?? 0) + 1 } : i);
    else best.set(k, { ...prev, also_posted: (prev.also_posted ?? 0) + 1 });
  }
  return [...best.values()];
}

/** "Price: 150 USD" style labels (devpool / Ubiquity) -> dollars, or null. */
export function priceFromLabels(labels = []) {
  for (const l of labels) {
    const m = /^\s*price:\s*\$?\s*([\d,]+(?:\.\d+)?)\s*(usd[ct]?)?\s*$/i.exec(l ?? "");
    if (m) return Number(m[1].replace(/,/g, ""));
  }
  return null;
}

/**
 * GitHub search for "bounty OR reward OR paid" returns many internal work tickets that merely mention the
 * word. Keep an issue only if a label says it pays (bounty / reward / funded / price), or it states an
 * amount and calls itself a bounty.
 */
export function isPayingIssue({ title = "", labels = [], signals = [], amountUsd = null }) {
  // "fix(router): …" / "feat: …" titles are submissions claiming a reward, not bounties to enter.
  if (/^\s*(fix|feat|chore|refactor|docs|test|perf)(\([^)]*\))?!?:/i.test(title)) return false;
  if (labels.some((l) => /bount|reward|funded|💎|^\s*price:/i.test(l ?? ""))) return true;
  if ((amountUsd ?? 0) < 5) return false;
  if (/\bbount(y|ies)\b|\breward\b/i.test(title)) return true;
  // "bounty" only in the body: also needs a payout address, or it's a work ticket that mentions money.
  return signals.includes("bounty") && signals.includes("payout address");
}

/** At most `max` GitHub items per repo: aggregator repos re-post the same bounty under several titles. */
export function capPerRepo(items, max = 2) {
  const n = new Map();
  return items.filter((i) => {
    if ((i.source ?? "github") !== "github") return true;
    const k = String(i.repo).toLowerCase();
    n.set(k, (n.get(k) ?? 0) + 1);
    return n.get(k) <= max;
  });
}
