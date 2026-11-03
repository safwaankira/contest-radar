import { POIDH_FEED } from "./config.js";
import { findDeadline } from "./dates.js";

/**
 * A candidate is anything that might be an open contest or bounty.
 * Shape: { id, source, url, title, text, author, postedAt, prizeHint, signals }
 */

const POIDH_CHAINS = { 1: "mainnet", 8453: "base", 42161: "arbitrum", 666666666: "degen" };

/** poidh publishes open bounties as free JSON. Prize, chain and claim state are exact. */
export async function poidhCandidates(limit = 40) {
  const r = await fetch(`${POIDH_FEED}?limit=${limit}`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`poidh feed HTTP ${r.status}`);
  const { items = [] } = await r.json();
  return items
    .filter((b) => b.inProgress && !b.isCanceled)
    .map((b) => ({
      id: `poidh:${b.chainId}:${b.id}`,
      source: "poidh",
      url: b.url,
      title: b.title,
      text: (b.description || "").slice(0, 1200),
      author: b.issuer,
      postedAt: b.createdAt ? new Date(b.createdAt * 1000).toISOString() : null,
      prizeHint: b.priceUsd ? `$${Number(b.priceUsd).toFixed(2)} (${POIDH_CHAINS[b.chainId] || b.chainId})` : null,
      prizeUsd: b.priceUsd ? Number(b.priceUsd) : null,
      deadline: findDeadline(b.description || ""),
      signals: {
        chain: POIDH_CHAINS[b.chainId] || String(b.chainId),
        hasClaims: Boolean(b.hasClaims),
        openVoting: Boolean(b.isMultiplayer),
        voting: Boolean(b.isVoting),
      },
    }));
}

/** Queries tuned to find posts that announce something you can enter, not chatter about it. */
export const X_QUERIES = [
  '(bounty OR "thread contest" OR "writing contest" OR "meme contest" OR "design contest") (prize OR reward OR USDC OR "$") (submit OR deadline OR "how to enter") -giveaway within_time:2d -filter:replies',
  '("hackathon" OR "build contest" OR "creator contest" OR "content contest") (prize OR pool OR USDC) (deadline OR "submissions close" OR "apply") within_time:2d -filter:replies',
];

export async function xCandidates(session, queries = X_QUERIES) {
  const out = [];
  for (const q of queries) {
    const { json } = await session.xSearch(q, "latest");
    for (const t of json?.output?.timeline || []) {
      if (t.type !== "tweet" || !t.text) continue;
      out.push({
        id: `x:${t.tweet_id}`,
        source: "x",
        url: `https://x.com/${t.screen_name}/status/${t.tweet_id}`,
        title: null,
        text: expandUrls(t).slice(0, 700),
        author: `@${t.screen_name}`,
        postedAt: t.created_at ? new Date(t.created_at).toISOString() : null,
        prizeHint: null,
        signals: {
          followers: t.user_info?.followers_count ?? null,
          verified: Boolean(t.user_info?.verified),
          likes: t.favorites ?? 0,
          reposts: t.retweets ?? 0,
          replies: t.replies ?? 0,
          views: Number(t.views || 0),
        },
      });
    }
  }
  return out;
}

export const REDDIT_QUERIES = ["crypto bounty prize submit", "web3 contest prize deadline"];

export async function redditCandidates(session, queries = REDDIT_QUERIES) {
  const out = [];
  for (const q of queries) {
    const { json } = await session.redditSearch(q, { sort: "new", timeRange: "week" });
    for (const c of json?.output?.children || []) {
      const p = c.post || c;
      if (!p?.permalink) continue;
      out.push({
        id: `reddit:${p.id}`,
        source: "reddit",
        url: `https://www.reddit.com${p.permalink}`,
        title: p.postTitle || null,
        text: (p.content?.markdown || "").slice(0, 700),
        author: p.authorInfo?.name ? `u/${p.authorInfo.name}` : null,
        postedAt: p.createdAt || null,
        prizeHint: null,
        signals: { score: p.score ?? 0, comments: p.commentCount ?? 0, subreddit: p.permalink.split("/")[2] },
      });
    }
  }
  return out;
}

function expandUrls(t) {
  let text = t.text;
  for (const u of t.entities?.urls || []) {
    if (u.url && u.expanded_url) text = text.replaceAll(u.url, u.expanded_url);
  }
  return text.replace(/https:\/\/t\.co\/\w+$/, "").trim();
}

/** Same post can surface from several queries; keep the first. */
export function dedupe(cands) {
  const seen = new Set();
  return cands.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}
