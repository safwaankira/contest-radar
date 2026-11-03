import { createBuySession } from "./buy.js";
import { poidhCandidates, xCandidates, redditCandidates, dedupe, X_QUERIES, REDDIT_QUERIES } from "./sources.js";
import { prefilter, buildPrompt, parseModel, assemble, fallback, toItem } from "./rank.js";

/**
 * One scan = free poidh feed + paid X and Reddit searches (buy gateway) + one paid model call (Agent402).
 * Returns ranked opportunities plus the receipts for every payment made.
 *
 * keywords (personal scans) narrow the paid searches to what the buyer cares about.
 */
export async function runScan({ keywords = null, label = "daily", sandbox, log = () => {} } = {}) {
  const session = createBuySession({ sandbox, label });
  const errors = [];
  const startedAt = new Date().toISOString();

  const xQueries = keywords ? [`(${keywords}) (bounty OR contest OR hackathon OR prize) (submit OR deadline OR enter) within_time:7d -filter:replies`] : X_QUERIES;
  const redditQueries = keywords ? [`${keywords} bounty contest prize`] : REDDIT_QUERIES.slice(0, 1);

  const [poidh, x, reddit] = await Promise.all([
    poidhCandidates().catch((e) => (errors.push(`poidh: ${e.message}`), [])),
    xCandidates(session, xQueries).catch((e) => (errors.push(`x: ${e.message}`), [])),
    redditCandidates(session, redditQueries).catch((e) => (errors.push(`reddit: ${e.message}`), [])),
  ]);
  log(`candidates poidh=${poidh.length} x=${x.length} reddit=${reddit.length}`);

  let pool = dedupe([...x, ...reddit, ...poidh]);
  if (keywords) {
    const words = keywords.toLowerCase().split(/\s+or\s+|[,\s]+/).filter((w) => w.length > 2);
    pool = pool.filter((c) => c.source !== "poidh" || words.some((w) => (c.title + " " + c.text).toLowerCase().includes(w)));
  }
  // poidh bounties are already structured (escrowed prize, chain, claims), so they skip the model.
  const poidhItems = pool
    .filter((c) => c.source === "poidh")
    .map((c) => toItem(c, { deadline: c.deadline, effort: "medium" }))
    .filter((i) => i && i.score > 0);
  const cands = prefilter(pool.filter((c) => c.source !== "poidh"));
  log(`poidh ranked ${poidhItems.length}; social after prefilter ${cands.length}`);

  let social = [];
  let model = null;
  if (cands.length) {
    const { messages, used } = buildPrompt(cands);
    try {
      const { json } = await session.chat(messages);
      const content = json?.choices?.[0]?.message?.content || "";
      const parsed = parseModel(content);
      model = { name: json?.model || session.llm(), read: used, kept: parsed.size };
      social = assemble(cands.slice(0, used), parsed);
      if (parsed.size === 0) {
        errors.push("model returned nothing parseable; used fallback");
        social = fallback(cands);
      }
    } catch (e) {
      errors.push(`model: ${e.message}`);
      if (e.paid) errors.push("model call was paid but failed; not retried");
      social = fallback(cands);
    }
  }
  const items = [...social, ...poidhItems].sort((a, b) => b.score - a.score);

  const spent = session.receipts.filter((r) => r.paid).reduce((s, r) => s + Number(r.amountUsd || 0), 0);
  return {
    kind: keywords ? "personal" : "daily",
    keywords,
    startedAt,
    finishedAt: new Date().toISOString(),
    agent: session.address,
    sandbox: session.sandbox,
    counts: { poidh: poidh.length, x: x.length, reddit: reddit.length, screened: cands.length, ranked: items.length },
    model,
    spentUsd: Number(spent.toFixed(4)),
    receipts: session.receipts,
    errors,
    items,
    ...(process.env.SCAN_DEBUG === "1" ? { screened: cands } : {}),
  };
}
