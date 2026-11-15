// Turn a contest link into plain text for the verdict agent. Free sources only.
// X posts: fxtwitter's public JSON (full long-post text, quoted post, article title). Other pages: fetched HTML
// stripped to text. Everything returned here is untrusted and is only ever passed to the model as data.

const MAX = 12_000;

export function tweetIdOf(url) {
  return /(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i.exec(String(url))?.[1] ?? null;
}

export function htmlToText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(br|p|div|li|h\d|tr|section|article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

async function xPost(id, fetchImpl, signal) {
  const r = await fetchImpl(`https://api.fxtwitter.com/status/${id}`, { signal, headers: { "user-agent": "contest-radar/0.3" } });
  if (!r.ok) throw new Error(`could not read that X post (${r.status})`);
  const j = await r.json();
  const t = j.tweet || {};
  const parts = [
    `X post by @${t.author?.screen_name || "?"} (${t.author?.followers ?? "?"} followers) on ${t.created_at || "?"}`,
    `Replies: ${t.replies ?? "?"}, quotes: ${t.quotes ?? "?"}, likes: ${t.likes ?? "?"}, views: ${t.views ?? "?"}`,
    t.raw_text?.text || t.text || "",
  ];
  if (t.article?.title) parts.push(`Article: ${t.article.title}\n${t.article.preview_text || ""}`);
  if (t.quote) parts.push(`Quoted post by @${t.quote.author?.screen_name}: ${t.quote.raw_text?.text || t.quote.text || ""}`);
  return parts.filter(Boolean).join("\n");
}

/** { text, source } for a URL. Throws a short, user-facing message on failure. */
export async function contestText(url, { fetchImpl = fetch, signal = AbortSignal.timeout(15_000) } = {}) {
  let u;
  try { u = new URL(url); } catch { throw new Error("that is not a valid link"); }
  if (u.protocol !== "https:") throw new Error("only https links");
  const id = tweetIdOf(u.href);
  if (id) return { text: (await xPost(id, fetchImpl, signal)).slice(0, MAX), source: "x" };
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(u.hostname) || u.hostname.endsWith(".internal")) throw new Error("that host is not allowed");
  const r = await fetchImpl(u.href, { signal, redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (contest-radar verdict)" } });
  if (!r.ok) throw new Error(`that page returned ${r.status}`);
  const text = htmlToText(await r.text());
  if (text.length < 80) throw new Error("that page has almost no text (it may need a browser); paste the contest text instead");
  return { text: `Page: ${u.href}\n${text}`.slice(0, MAX), source: "page" };
}
