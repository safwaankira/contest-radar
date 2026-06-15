import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const DEFAULT_FEED_URL = 'https://go165.github.io/bounty-radar/feed/latest.json';

export async function loadFeed(source = DEFAULT_FEED_URL) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source, {
      headers: { accept: 'application/json', 'user-agent': 'bounty-radar-shortlist' },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch feed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  const fileUrl = source.startsWith('file:') ? source : pathToFileURL(source).href;
  return JSON.parse(await readFile(new URL(fileUrl), 'utf8'));
}

export function buildShortlist(feed, options = {}) {
  const {
    minScore = 50,
    limit = 10,
    preset,
    repo,
    signal,
    requireAmount = false,
    requireRail = false,
    rejectContextLeak = false,
    allowManualFriction = true,
    maxRiskScore = Number.POSITIVE_INFINITY,
    excludeRisk = [],
    minAmountUsd = 0,
  } = options;
  const signalRegex = signal ? new RegExp(signal, 'i') : null;
  const excludeRiskRegexes = excludeRisk.map((value) => new RegExp(value, 'i'));

  return [...(feed.items ?? [])]
    .filter((item) => Number(item.score) >= minScore)
    .filter((item) => !preset || item.preset === preset)
    .filter((item) => !repo || item.repo === repo)
    .filter((item) => !signalRegex || item.signals?.some((value) => signalRegex.test(value)))
    .filter((item) => !requireAmount || item.signals?.some((value) => /amount/i.test(value)))
    .filter((item) => !requireRail || item.signals?.some((value) => /USDC|Base|x402|MRWK|MergeWork/i.test(value)))
    .filter((item) => amountForFilter(item) >= minAmountUsd)
    .filter((item) => Number(item.risk_score ?? 0) <= maxRiskScore)
    .filter((item) => allowManualFriction || !item.manual_friction)
    .filter((item) => !rejectContextLeak || !hasRisk(item, /hidden-context-leak|secret-or-wallet-risk/i))
    .filter((item) => excludeRiskRegexes.every((regex) => !hasRisk(item, regex)))
    .sort((a, b) => Number(b.score) - Number(a.score) || Date.parse(b.updated_at) - Date.parse(a.updated_at))
    .slice(0, limit);
}

export function formatShortlist(items, format = 'markdown') {
  if (format === 'json') {
    return `${JSON.stringify(items, null, 2)}\n`;
  }
  if (format === 'csv') {
    return toCsv(items);
  }
  if (format !== 'markdown') {
    throw new Error(`Unsupported format: ${format}`);
  }
  if (items.length === 0) {
    return 'No matching bounty issues found.\n';
  }

  const rows = [
    ['Score', 'Risk', 'Repo', 'Signals', 'Risk Flags', 'Title', 'URL'],
    ['---:', '---:', '---', '---', '---', '---', '---'],
    ...items.map((item) => [
      item.score,
      item.risk_score ?? 0,
      item.repo,
      (item.signals ?? []).join(', '),
      formatRiskFlags(item.risk_flags ?? []),
      item.title,
      item.url,
    ]),
  ];
  return `${rows.map((row) => `| ${row.map(markdownCell).join(' | ')} |`).join('\n')}\n`;
}

export function parseArgs(argv) {
  const options = {
    feed: DEFAULT_FEED_URL,
    format: 'markdown',
    limit: 10,
    minScore: 50,
    preset: undefined,
    repo: undefined,
    signal: undefined,
    requireAmount: false,
    requireRail: false,
    rejectContextLeak: false,
    allowManualFriction: true,
    maxRiskScore: Number.POSITIVE_INFINITY,
    excludeRisk: [],
    minAmountUsd: 0,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      i += 1;
      return value;
    };

    if (arg === '--feed') options.feed = next();
    else if (arg === '--format') options.format = next();
    else if (arg === '--limit') options.limit = parsePositiveInteger(next(), '--limit');
    else if (arg === '--min-score') options.minScore = parseNonNegativeNumber(next(), '--min-score');
    else if (arg === '--preset') options.preset = next();
    else if (arg === '--repo') options.repo = next();
    else if (arg === '--signal') options.signal = next();
    else if (arg === '--require-amount') options.requireAmount = true;
    else if (arg === '--require-rail') options.requireRail = true;
    else if (arg === '--reject-context-leak') options.rejectContextLeak = true;
    else if (arg === '--no-manual-friction') options.allowManualFriction = false;
    else if (arg === '--max-risk-score') options.maxRiskScore = parseNonNegativeNumber(next(), '--max-risk-score');
    else if (arg === '--min-amount-usd') options.minAmountUsd = parseNonNegativeNumber(next(), '--min-amount-usd');
    else if (arg === '--exclude-risk') options.excludeRisk.push(next());
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!['json', 'markdown', 'csv'].includes(options.format)) {
    throw new Error('--format must be json, markdown, or csv');
  }
  return options;
}

export function helpText() {
  return `Usage: node scripts/shortlist.mjs [options]

Options:
  --feed <url-or-file>       Feed URL or local JSON file. Defaults to the hosted daily feed.
  --min-score <number>       Minimum score to include. Default: 50.
  --limit <number>           Maximum rows to output. Default: 10.
  --preset <id>              Filter to a preset such as mergework, x402, or base-usdc.
  --repo <owner/name>        Filter to one repository.
  --signal <regex>           Require a matching signal label.
  --require-amount           Require an amount signal.
  --require-rail             Require a USDC/Base/x402/MRWK payment-rail signal.
  --reject-context-leak      Exclude issues that ask for hidden/system/startup context or wallet-secret actions.
  --no-manual-friction       Exclude issues that require signup, manual approval, KYC, or account-heavy work.
  --max-risk-score <number>  Maximum risk penalty to include. Default: no cap.
  --min-amount-usd <number>  Minimum parsed USD/USDC amount to include. Default: 0.
  --exclude-risk <regex>     Exclude a matching risk flag label. Can be repeated.
  --format <type>            markdown, json, or csv. Default: markdown.
  -h, --help                 Show this help.
`;
}

function parsePositiveInteger(value, flag) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`${flag} must be a positive integer`);
  return number;
}

function parseNonNegativeNumber(value, flag) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${flag} must be a non-negative number`);
  return number;
}

function toCsv(items) {
  const rows = [
    ['score', 'raw_score', 'risk_score', 'amount_usd', 'payout_amount_usd', 'preset', 'repo', 'title', 'url', 'updated_at', 'signals', 'risk_flags', 'manual_friction', 'addresses'],
    ...items.map((item) => [
      item.score,
      item.raw_score ?? item.score,
      item.risk_score ?? 0,
      item.amount_usd ?? '',
      item.payout_amount_usd ?? '',
      item.preset,
      item.repo,
      item.title,
      item.url,
      item.updated_at,
      (item.signals ?? []).join('|'),
      formatRiskFlags(item.risk_flags ?? []),
      Boolean(item.manual_friction),
      (item.addresses ?? []).map((address) => `${address.type}:${address.value}`).join('|'),
    ]),
  ];
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function hasRisk(item, regex) {
  return (item.risk_flags ?? []).some((flag) => regex.test(flag.label ?? ''));
}

function formatRiskFlags(flags) {
  return flags.map((flag) => `${flag.label}:${flag.severity}:${flag.penalty}`).join(', ');
}

function amountForFilter(item) {
  if (Object.hasOwn(item, 'payout_amount_usd')) {
    return Number(item.payout_amount_usd ?? 0);
  }
  return Number(item.amount_usd ?? 0);
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function markdownCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  const feed = await loadFeed(options.feed);
  const items = buildShortlist(feed, options);
  process.stdout.write(formatShortlist(items, options.format));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
