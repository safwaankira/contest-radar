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
    '"effort":"low|medium|high","task":"<what to submit, max 14 words>","name":"<sponsor or project, max 4 words>"}. ' +
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
  const timing = deadlinePoints(deadline, now);
  if (timing === null) return null; // closed

  if (!/^https:\/\//i.test(c.url || "")) return null; // links come from third-party feeds
  const prizeUsd = c.prizeUsd ?? (Number.isFinite(m.prizeUsd) && m.prizeUsd > 0 && m.prizeUsd <= 100000 ? m.prizeUsd : null);
  const kind = KINDS.includes(m.kind) ? m.kind : "other";
  const extraSignals = [`source:${c.source}`];
  if (c.source === "poidh") extraSignals.push("escrowed onchain");
  // When the model read a prize the regexes would miss (e.g. "0.05 ETH"), state it so the scorer sees it.
  const body = prizeUsd && !/\$\s?\d/.test(c.text) ? `${c.text}\nreward: $${Math.round(prizeUsd)}` : c.text;

  const base = scoreText({ title: c.title || m.task || "", body, labels: [kind, c.source], updatedAt: c.postedAt, extraSignals });
  const crowded = isCrowded(c);
  const trust = c.source === "poidh" ? 8 : c.signals?.verified || (c.signals?.followers ?? 0) > 5000 ? 6 : (c.signals?.followers ?? 0) < 200 && c.source === "x" ? -6 : 0;
  const effortAdj = m.effort === "low" ? 6 : m.effort === "high" ? -6 : 0;
  // Open for weeks with no stated deadline: probably forgotten or already decided off-platform.
  const ageDays = c.postedAt ? (now - Date.parse(c.postedAt)) / 864e5 : 0;
  const stalePenalty = !deadline && ageDays > 21 ? 12 : 0;
  // Prize size on a log scale: $1 -12, $10 0, $100 +12, $1000+ +24. Unknown prize -4.
  const prizeForScore = prizeUsd ?? base.payout_amount_usd ?? null;
  const prizeAdj = prizeForScore ? Math.max(-12, Math.min(24, Math.round(12 * Math.log10(Math.max(prizeForScore, 1)) - 12))) : -4;
  const score = base.opportunity_class === "avoid" ? 0 : Math.max(0, Math.round(base.score + timing + trust + effortAdj + prizeAdj - stalePenalty - (crowded ? 10 : 0)));

  return {
    ...base,
    score,
    text_score: base.score,
    source: c.source,
    preset: c.source,
    preset_name: { poidh: "poidh bounties", x: "X contests", reddit: "Reddit" }[c.source] || c.source,
    repo: c.source === "poidh" ? `poidh/${c.signals?.chain || "?"}` : c.author || c.source,
    title: c.title || m.task || c.text.slice(0, 90),
    url: c.url,
    updated_at: c.postedAt,
    amount_usd: base.amount_usd ?? prizeUsd,
    payout_amount_usd: prizeUsd ?? base.payout_amount_usd,
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
      ...(stalePenalty ? [`open ${Math.round(ageDays)} days with no deadline`] : []),
      ...base.decision_notes,
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
