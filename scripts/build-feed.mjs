import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildRssFeed } from './feed-rss.mjs';
import { scoreText, assessOpportunity } from './scoring.mjs';
import { worthScore, rescore, groupSlots, dedupeAnnouncements, priceFromLabels, isPayingIssue } from '../lib/rank.js';

// Bot-generated roundups ("Bounty Alert: 11 New Opportunities found") list other people's
// bounties; they are not bounties themselves.
const ROUNDUP = /\b(bounty alert|new opportunit(?:y|ies)|opportunities found|bounties found|weekly (?:digest|roundup)|daily (?:digest|roundup))\b|радар|ждут ответа/i;
// A claim or submission thread is someone else's entry, not an open bounty.
const CLAIM = /^\s*\[?\s*bounty\s*(?:#\d+\s*)?claim\b|\bclaim:\s*\d/i;
const MAX_PLAUSIBLE_ISSUE_USD = 100000;

const SITE = process.env.SITE_URL || 'https://contest-radar-celo.vercel.app';
// Contest sources (poidh free; X, Reddit and the model paid through buy on Celo)
// run when the agent key is present. CONTESTS=0 builds the GitHub-only feed.
const withContests = process.env.CONTESTS !== '0' && Boolean(process.env.AGENT_PRIVATE_KEY || process.env.BUY_SANDBOX === '1');

const presets = [
  {
    id: 'high-signal',
    name: 'High-signal bounties',
    query: 'is:issue is:open bounty OR reward OR paid',
  },
  {
    id: 'base-usdc',
    name: 'Base / USDC',
    query: 'is:issue is:open bounty USDC Base',
  },
  {
    id: 'x402',
    name: 'x402 paid APIs',
    query: 'is:issue is:open x402 OR "HTTP 402" OR "paid API"',
  },
  {
    id: 'mergework',
    name: 'MergeWork / MRWK',
    query: 'is:issue is:open MRWK OR MergeWork OR "mrwk:bounty"',
  },
];

const token = process.env.GITHUB_TOKEN;
const SEARCH_TIMEOUT_MS = 15000;
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'contest-radar-feed',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

const previousFeed = await readPreviousFeed();
const previousItems = normalizeExistingItems(previousFeed.items ?? []);
const items = [];
const seen = new Set();
const errors = [];

for (const preset of presets) {
  const url = new URL('https://api.github.com/search/issues');
  url.searchParams.set('q', preset.query);
  url.searchParams.set('sort', 'updated');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', '12');

  let response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
  } catch (error) {
    errors.push({ preset: preset.id, status: 0, message: error instanceof Error ? error.message : String(error) });
    continue;
  }
  if (!response.ok) {
    errors.push({ preset: preset.id, status: response.status, message: compactError(await response.text()) });
    continue;
  }

  const payload = await response.json();
  for (const issue of payload.items ?? []) {
    if (!/^https:\/\/github\.com\//.test(issue.html_url ?? '')) continue;
    if (seen.has(issue.html_url)) continue;
    seen.add(issue.html_url);
    const scored = scoreIssue(issue, preset);
    if (scored) items.push(scored);
  }
}

for (const presetId of new Set(errors.map((error) => error.preset))) {
  for (const item of previousItems.filter((row) => row.preset === presetId)) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    items.push({
      ...item,
      decision_notes: [
        ...(item.decision_notes ?? []),
        `retained from previous feed after ${presetId} search failed`,
      ].slice(0, 6),
    });
  }
}

let contestRun = null;
if (withContests) {
  const { runScan } = await import('../lib/scan.js');
  try {
    contestRun = await runScan({ label: 'daily', log: (m) => console.log('·', m) });
    const found = new Set(contestRun.items.map((item) => item.url));
    for (const item of contestRun.items) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      items.push({ ...item, first_seen: previousItems.find((p) => p.url === item.url)?.first_seen ?? contestRun.finishedAt });
    }
    // Contests stay listed until their deadline (or 10 days) even on days the search misses them.
    // Carried items are re-scored on today's scale, then everything is grouped and de-duplicated once.
    const today = new Date().toISOString().slice(0, 10);
    const carried = [];
    for (const item of previousItems.filter((p) => p.source && p.source !== 'github' && !found.has(p.url))) {
      if (item.deadline && item.deadline < today) continue;
      if (Date.now() - Date.parse(item.first_seen ?? item.updated_at ?? 0) > 10 * 864e5) continue;
      const fresh = rescore(item);
      if (fresh && fresh.score > 0) carried.push({ ...fresh, carried: true });
    }
    const contestItems = dedupeAnnouncements(groupSlots([...items.filter((i) => i.source && i.source !== 'github'), ...carried]));
    for (let k = items.length - 1; k >= 0; k--) if (items[k].source && items[k].source !== 'github') items.splice(k, 1);
    seen.clear();
    for (const item of items) seen.add(item.url);
    for (const item of contestItems) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      items.push(item);
    }
    for (const message of contestRun.errors) errors.push({ preset: 'contests', status: 0, message: compactError(message) });
  } catch (error) {
    errors.push({ preset: 'contests', status: 0, message: compactError(String(error instanceof Error ? error.message : error).replace(/https?:\/\/\S+/g, '<url>')) });
  }
}

for (let i = items.length - 1; i >= 0; i--) if (items[i].opportunity_class === 'avoid' || items[i].score <= 0) items.splice(i, 1);
items.sort((a, b) => b.score - a.score || new Date(b.updated_at) - new Date(a.updated_at));
{
  let github = 0;
  for (let i = 0; i < items.length; i++) {
    if ((items[i].source ?? 'github') !== 'github') continue;
    if (++github > 20) items.splice(i--, 1);
  }
}
const outputItems = items.length > 0 ? items : previousItems;
const feedItems = outputItems.slice(0, 80);
if (items.length === 0 && outputItems.length > 0) {
  errors.push({
    preset: 'fallback',
    status: 0,
    message: 'GitHub search failed for all presets; retained previous feed items.',
  });
}

const feed = {
  generated_at: new Date().toISOString(),
  source: 'https://github.com/safwaankira/contest-radar',
  demo: SITE,
  manifest: `${SITE}/feed/manifest.json`,
  schema: `${SITE}/feed/schema.json`,
  methodology: 'GitHub issues, poidh bounties, and X and Reddit posts. A model reads each post for prize, deadline, effort and what to submit. Scoring is plain code: payout terms, payment rails, amount text, risk flags (scams, key requests, KYC friction), effort, deadline window and competition.',
  run: contestRun ? { counts: contestRun.counts, model: contestRun.model, spent_usd: contestRun.spentUsd, agent: contestRun.agent, sandbox: contestRun.sandbox } : null,
  count: feedItems.length,
  errors,
  items: feedItems,
};

await mkdir('feed', { recursive: true });
await writeFile('feed/latest.json', `${JSON.stringify(feed, null, 2)}\n`);
await writeFile('feed/latest.csv', toCsv(feed.items));
await writeFile('feed/latest.xml', buildRssFeed(feed));
await writeFile('feed/manifest.json', `${JSON.stringify(buildManifest(feed), null, 2)}\n`);
// Receipts of every paid call in this run, for the public ledger (scripts/daily.js).
await writeFile('feed/run.json', `${JSON.stringify(contestRun ? { at: contestRun.finishedAt, spent_usd: contestRun.spentUsd, receipts: contestRun.receipts, errors: contestRun.errors } : null, null, 2)}\n`);
console.log(`Wrote ${feed.count} items to feed/latest.json`);

function buildManifest(feed) {
  return {
    name: 'Contest Radar daily feed',
    description: 'Machine-readable shortlist of open bounties and contests (GitHub, poidh, X, Reddit) scored for payout clarity, payment rails, amount, risk, effort, deadline and competition.',
    homepage: feed.demo,
    repository: feed.source,
    latest_json: `${SITE}/feed/latest.json`,
    latest_csv: `${SITE}/feed/latest.csv`,
    latest_rss: `${SITE}/feed/latest.xml`,
    schema: feed.schema,
    generated_at: feed.generated_at,
    count: feed.count,
    errors: feed.errors,
    refresh: {
      cadence: 'daily',
      runner: 'scripts/daily.js on the agent host',
    },
    intended_consumers: [
      'developer dashboards',
      'coding agents',
      'bounty triage scripts',
      'rss readers',
      'x402 paid API adapters',
    ],
    limitations: [
      'Scores are heuristic triage signals, not payout guarantees.',
      'Consumers should verify issue terms, sponsor reputation, and payment rules before doing work.',
      'Unauthenticated GitHub search can miss private, rate-limited, or recently indexed issues.',
    ],
  };
}

function compactError(text) {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240) || 'request failed';
}

async function readPreviousFeed() {
  try {
    return JSON.parse(await readFile('feed/latest.json', 'utf8'));
  } catch {
    return { items: [] };
  }
}

function normalizeExistingItems(rows) {
  return rows.map((item) => {
    if (item.opportunity_class && Number.isFinite(Number(item.effort_score))) return item;

    const labels = Array.isArray(item.labels) ? item.labels : [];
    const signals = Array.isArray(item.signals) ? item.signals : [];
    const riskFlags = Array.isArray(item.risk_flags) ? item.risk_flags : [];
    const text = `${item.title ?? ''}\n${labels.join(' ')}\n${signals.join(' ')}`;
    const opportunity = assessOpportunity({
      text,
      labelText: labels.join(' '),
      score: Number(item.score ?? 0),
      rawScore: Number(item.raw_score ?? item.score ?? 0),
      riskScore: Number(item.risk_score ?? 0),
      riskFlags,
      manualFriction: Boolean(item.manual_friction),
      signals,
      amountUsd: item.amount_usd ?? null,
      payoutAmountUsd: item.payout_amount_usd ?? null,
    });

    return {
      ...item,
      opportunity_class: opportunity.opportunity_class,
      effort_score: opportunity.effort_score,
      effort_signals: opportunity.effort_signals,
      decision_notes: opportunity.decision_notes,
    };
  });
}

function scoreIssue(issue, preset) {
  const labels = (issue.labels ?? []).map((label) => label.name ?? '').filter(Boolean);
  const scored = scoreText({ title: issue.title, body: issue.body, labels, updatedAt: issue.updated_at });
  // Bounty platforms like devpool put the reward in a label ("Price: 150 USD").
  const labelPrice = priceFromLabels(labels);
  if (labelPrice != null && scored.amount_usd == null && scored.payout_amount_usd == null) {
    scored.amount_usd = labelPrice;
    scored.payout_amount_usd = labelPrice;
    scored.decision_notes = [`reward from label: $${labelPrice}`, ...scored.decision_notes].slice(0, 6);
  }
  if (!isPayingIssue({ title: issue.title, labels, signals: scored.signals, amountUsd: scored.payout_amount_usd ?? scored.amount_usd })) return null;
  if (ROUNDUP.test(issue.title ?? '') || CLAIM.test(issue.title ?? '')) {
    scored.score = 0;
    scored.opportunity_class = 'avoid';
    scored.decision_notes = ['roundup or claim thread, not an open bounty', ...scored.decision_notes].slice(0, 6);
  }
  // A seven-figure "bounty" on an issue is almost always a program page or a misread number.
  for (const key of ['amount_usd', 'payout_amount_usd']) {
    if ((scored[key] ?? 0) > MAX_PLAUSIBLE_ISSUE_USD) {
      scored[key] = null;
      if (!scored.signals.includes('implausible amount')) scored.signals.push('implausible amount');
    }
  }
  if (scored.signals.includes('implausible amount') && scored.opportunity_class === 'high-value') {
    scored.opportunity_class = 'manual-review';
    scored.score = Math.max(0, scored.score - 20);
  }
  // Same worth scale as contests; bounty-radar's payout-clarity score becomes one input.
  scored.text_score = scored.score;
  scored.score = worthScore({
    prizeUsd: scored.payout_amount_usd ?? scored.amount_usd ?? null,
    effortScore: scored.effort_score,
    trust: 5,
    clarity: scored.text_score,
    avoid: scored.opportunity_class === 'avoid' || scored.score === 0,
  });
  return {
    ...scored,
    source: 'github',
    preset: preset.id,
    preset_name: preset.name,
    repo: issue.repository_url?.replace('https://api.github.com/repos/', '') ?? 'unknown/repo',
    title: issue.title,
    url: issue.html_url,
    updated_at: issue.updated_at,
  };
}

function toCsv(rows) {
  const header = ['score', 'raw_score', 'risk_score', 'opportunity_class', 'effort_score', 'amount_usd', 'payout_amount_usd', 'preset', 'repo', 'title', 'url', 'updated_at', 'signals', 'effort_signals', 'risk_flags', 'manual_friction', 'addresses'];
  const values = rows.map((item) => [
    item.score,
    item.raw_score,
    item.risk_score,
    item.opportunity_class,
    item.effort_score,
    item.amount_usd ?? '',
    item.payout_amount_usd ?? '',
    item.preset,
    item.repo,
    item.title,
    item.url,
    item.updated_at,
    item.signals.join('|'),
    item.effort_signals.join('|'),
    item.risk_flags.map((flag) => `${flag.label}:${flag.severity}:${flag.penalty}`).join('|'),
    item.manual_friction,
    item.addresses.map((address) => `${address.type}:${address.value}`).join('|'),
  ]);
  return `${[header, ...values].map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
