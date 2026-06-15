import { mkdir, writeFile } from 'node:fs/promises';

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

const signalPatterns = [
  { label: 'bounty', regex: /\b(bounty|reward|prize|paid|payout|compensation)\b/i, points: 12 },
  { label: 'USDC/Base', regex: /\b(USDC|Base|Coinbase|onchain|stablecoin)\b/i, points: 18 },
  { label: 'x402', regex: /\b(x402|HTTP 402|402 Payment Required|paid API)\b/i, points: 18 },
  { label: 'MRWK/MergeWork', regex: /\b(MRWK|MergeWork|mrwk:bounty|mrwk1)\b/i, points: 18 },
  { label: 'amount', regex: /(\$|USD|USDC|MRWK)\s?\d|\d+\s?(USD|USDC|MRWK)/i, points: 16 },
];

const riskPatterns = [
  {
    label: 'hidden-context-leak',
    severity: 'blocker',
    penalty: 90,
    regex: /\b(system prompt|system instructions|developer message|startup instructions|boot context|boot_context|_provenance|provenance\.json|initial prompt|hidden instructions|before first human message|full conversation transcript)\b|paste.{0,80}\b(system|developer|prompt|instructions)\b/i,
  },
  {
    label: 'secret-or-wallet-risk',
    severity: 'blocker',
    penalty: 70,
    regex: /\b(private key|seed phrase|mnemonic|wallet private|export.*key|sign transaction|send funds|mainnet transaction|transfer .*USDC)\b/i,
  },
  {
    label: 'requires-signup-confirmation',
    severity: 'manual',
    penalty: 28,
    regex: /\b(sign up|signup|register before|developer access|access pending|maintainer confirmation|approval required|must be approved|wait for approval|claim required|must claim)\b/i,
  },
  {
    label: 'kyc-or-account-friction',
    severity: 'manual',
    penalty: 24,
    regex: /\b(KYC|identity verification|tax form|W-9|W8BEN|bank account|invoice required|manual payout|Devpost account|login required|account required)\b/i,
  },
  {
    label: 'competition-noise',
    severity: 'high',
    penalty: 22,
    regex: /\b(duplicate|already implemented|winner selected|accepted solution|merged solution|many PRs|first come first served|first to merge|assigned to|claimed by)\b/i,
  },
];

const addressPatterns = [
  { type: 'EVM', regex: /0x[a-fA-F0-9]{40}/g },
  { type: 'Stellar', regex: /G[A-Z2-7]{55}/g },
  { type: 'MRWK', regex: /mrwk1[a-z0-9]{20,80}/gi },
];

const token = process.env.GITHUB_TOKEN;
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'bounty-radar-feed',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

const items = [];
const seen = new Set();

for (const preset of presets) {
  const url = new URL('https://api.github.com/search/issues');
  url.searchParams.set('q', preset.query);
  url.searchParams.set('sort', 'updated');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', '12');

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub search failed for ${preset.id}: ${response.status} ${await response.text()}`);
  }

  const payload = await response.json();
  for (const issue of payload.items ?? []) {
    if (seen.has(issue.html_url)) continue;
    seen.add(issue.html_url);
    items.push(scoreIssue(issue, preset));
  }
}

items.sort((a, b) => b.score - a.score || new Date(b.updated_at) - new Date(a.updated_at));

const feed = {
  generated_at: new Date().toISOString(),
  source: 'https://github.com/go165/bounty-radar',
  demo: 'https://go165.github.io/bounty-radar/',
  manifest: 'https://go165.github.io/bounty-radar/feed/manifest.json',
  schema: 'https://go165.github.io/bounty-radar/feed/schema.json',
  methodology: 'Heuristic GitHub issue triage based on payout terms, payment rails, amount text, labels, payout address shapes, and negative risk signals such as hidden-context leakage, manual access friction, KYC/account requirements, and competition noise.',
  count: items.length,
  items: items.slice(0, 40),
};

await mkdir('feed', { recursive: true });
await writeFile('feed/latest.json', `${JSON.stringify(feed, null, 2)}\n`);
await writeFile('feed/latest.csv', toCsv(feed.items));
await writeFile('feed/manifest.json', `${JSON.stringify(buildManifest(feed), null, 2)}\n`);
console.log(`Wrote ${feed.count} items to feed/latest.json`);

function buildManifest(feed) {
  return {
    name: 'Bounty Radar daily feed',
    description: 'Machine-readable GitHub bounty issue shortlist scored for payout clarity, payment rails, amount text, labels, and payout address hints.',
    homepage: feed.demo,
    repository: feed.source,
    latest_json: 'https://go165.github.io/bounty-radar/feed/latest.json',
    latest_csv: 'https://go165.github.io/bounty-radar/feed/latest.csv',
    schema: feed.schema,
    generated_at: feed.generated_at,
    count: feed.count,
    refresh: {
      cadence: 'daily',
      github_actions_workflow: 'Daily bounty feed',
    },
    intended_consumers: [
      'developer dashboards',
      'coding agents',
      'bounty triage scripts',
      'x402 paid API adapters',
    ],
    limitations: [
      'Scores are heuristic triage signals, not payout guarantees.',
      'Consumers should verify issue terms, sponsor reputation, and payment rules before doing work.',
      'Unauthenticated GitHub search can miss private, rate-limited, or recently indexed issues.',
    ],
  };
}

function scoreIssue(issue, preset) {
  const text = `${issue.title ?? ''}\n${issue.body ?? ''}`;
  const labels = (issue.labels ?? []).map((label) => label.name ?? '').filter(Boolean);
  const labelText = labels.join(' ');
  const signals = [];
  let rawScore = 0;

  for (const signal of signalPatterns) {
    if (signal.regex.test(text) || signal.regex.test(labelText)) {
      signals.push(signal.label);
      rawScore += signal.points;
    }
  }

  if (/\b(bounty|reward|paid|help wanted)\b/i.test(labelText)) {
    signals.push('label match');
    rawScore += 8;
  }

  const addresses = extractAddresses(text);
  if (addresses.length > 0) {
    signals.push('payout address');
    rawScore += 20;
  }

  const daysOld = (Date.now() - new Date(issue.updated_at).getTime()) / 86400000;
  if (daysOld > 120) {
    signals.push('stale');
    rawScore -= 8;
  }

  const riskFlags = analyzeRisk(text, labelText);
  const riskScore = riskFlags.reduce((total, flag) => total + flag.penalty, 0);
  const manualFriction = riskFlags.some((flag) => flag.severity === 'manual');

  return {
    score: Math.max(0, rawScore - riskScore),
    raw_score: Math.max(0, rawScore),
    risk_score: riskScore,
    risk_flags: riskFlags,
    manual_friction: manualFriction,
    preset: preset.id,
    preset_name: preset.name,
    repo: issue.repository_url?.replace('https://api.github.com/repos/', '') ?? 'unknown/repo',
    title: issue.title,
    url: issue.html_url,
    updated_at: issue.updated_at,
    labels,
    signals: [...new Set(signals)],
    addresses,
  };
}

function analyzeRisk(text, labelText) {
  const haystack = `${text}\n${labelText}`;
  return riskPatterns
    .filter((risk) => risk.regex.test(haystack))
    .map((risk) => ({
      label: risk.label,
      severity: risk.severity,
      penalty: risk.penalty,
    }));
}

function extractAddresses(text) {
  const matches = [];
  for (const pattern of addressPatterns) {
    for (const match of text.match(pattern.regex) ?? []) {
      matches.push({ type: pattern.type, value: match });
    }
  }
  return uniqueBy(matches, (item) => `${item.type}:${item.value.toLowerCase()}`);
}

function uniqueBy(items, keyFn) {
  const seenKeys = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}

function toCsv(rows) {
  const header = ['score', 'raw_score', 'risk_score', 'preset', 'repo', 'title', 'url', 'updated_at', 'signals', 'risk_flags', 'manual_friction', 'addresses'];
  const values = rows.map((item) => [
    item.score,
    item.raw_score,
    item.risk_score,
    item.preset,
    item.repo,
    item.title,
    item.url,
    item.updated_at,
    item.signals.join('|'),
    item.risk_flags.map((flag) => `${flag.label}:${flag.severity}:${flag.penalty}`).join('|'),
    item.manual_friction,
    item.addresses.map((address) => `${address.type}:${address.value}`).join('|'),
  ]);
  return `${[header, ...values].map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
