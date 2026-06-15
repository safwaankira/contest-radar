import { pathToFileURL } from 'node:url';
import { auditCandidate } from './audit-candidate.mjs';
import { buildShortlist, loadFeed } from './shortlist.mjs';

export function parseArgs(argv) {
  const options = {
    feed: 'feed/latest.json',
    format: 'markdown',
    limit: 10,
    minScore: 1,
    requireAmount: true,
    requireRail: false,
    requirePayoutSignal: true,
    rejectContextLeak: true,
    allowManualFriction: false,
    maxRiskScore: 25,
    minAmountUsd: 50,
    maxCompetitionScore: 40,
    maxCommentsForFullAudit: 80,
    maxRelatedPulls: 12,
    searchLimit: 20,
    recommendation: ['consider'],
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
    else if (arg === '--max-risk-score') options.maxRiskScore = parseNonNegativeNumber(next(), '--max-risk-score');
    else if (arg === '--min-amount-usd') options.minAmountUsd = parseNonNegativeNumber(next(), '--min-amount-usd');
    else if (arg === '--max-competition-score') options.maxCompetitionScore = parseNonNegativeNumber(next(), '--max-competition-score');
    else if (arg === '--max-comments-full-audit') options.maxCommentsForFullAudit = parseNonNegativeNumber(next(), '--max-comments-full-audit');
    else if (arg === '--max-related-pulls') options.maxRelatedPulls = parsePositiveInteger(next(), '--max-related-pulls');
    else if (arg === '--search-limit') options.searchLimit = parsePositiveInteger(next(), '--search-limit');
    else if (arg === '--require-rail') options.requireRail = true;
    else if (arg === '--allow-no-payout-signal') options.requirePayoutSignal = false;
    else if (arg === '--allow-manual-friction') options.allowManualFriction = true;
    else if (arg === '--allow-context-risk') options.rejectContextLeak = false;
    else if (arg === '--recommendation') options.recommendation = next().split(',').map((value) => value.trim()).filter(Boolean);
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!['json', 'markdown'].includes(options.format)) {
    throw new Error('--format must be json or markdown');
  }
  return options;
}

export function filterAudited(rows, options) {
  const allowed = new Set(options.recommendation);
  return rows
    .filter((row) => allowed.has(row.audit.recommendation))
    .filter((row) => Number(row.audit.competition_score ?? 0) <= options.maxCompetitionScore)
    .sort((a, b) => Number(b.item.score) - Number(a.item.score) || Number(a.audit.competition_score) - Number(b.audit.competition_score));
}

export function formatAudited(rows, format = 'markdown') {
  if (format === 'json') return `${JSON.stringify(rows, null, 2)}\n`;
  if (rows.length === 0) return 'No audited candidates passed the filters.\n';

  const table = [
    ['Score', 'Competition', 'Recommendation', 'Repo', 'Title', 'Issue'],
    ['---:', '---:', '---', '---', '---', '---'],
    ...rows.map((row) => [
      row.item.score,
      row.audit.competition_score,
      row.audit.recommendation,
      row.item.repo,
      row.item.title,
      row.item.url,
    ]),
  ];
  return `${table.map((line) => `| ${line.map(markdownCell).join(' | ')} |`).join('\n')}\n`;
}

export function helpText() {
  return `Usage: node scripts/audit-shortlist.mjs [options]

Options:
  --feed <file-or-url>             Feed file or URL. Default: feed/latest.json.
  --min-score <number>             Minimum feed score. Default: 1.
  --limit <number>                 Candidate rows to audit before filtering. Default: 10.
  --max-risk-score <number>        Maximum feed risk score. Default: 25.
  --min-amount-usd <number>        Minimum parsed USD/USDC amount to audit. Default: 50.
  --max-competition-score <number> Maximum post-audit competition score. Default: 40.
  --max-comments-full-audit <n>    Treat higher-comment issues as noisy without full audit. Default: 80.
  --max-related-pulls <n>          Related PRs to fetch per issue. Default: 12.
  --search-limit <n>               GitHub PR search results per query. Default: 20.
  --require-rail                   Require USDC/Base/x402/MRWK payment rail.
  --allow-no-payout-signal         Allow technical issues without bounty/price/reward labeling.
  --allow-manual-friction          Do not exclude signup/KYC/manual-friction feed risks.
  --allow-context-risk             Do not exclude hidden-context or wallet-secret feed risks.
  --recommendation <csv>           Allowed audit recommendations. Default: consider.
  --format <json|markdown>         Output format. Default: markdown.
  -h, --help                       Show this help.
`;
}

async function auditShortlist(options) {
  const feed = await loadFeed(options.feed);
  const candidates = buildShortlist(feed, {
    minScore: options.minScore,
    limit: options.limit,
    requireAmount: options.requireAmount,
    requireRail: options.requireRail,
    rejectContextLeak: options.rejectContextLeak,
    allowManualFriction: options.allowManualFriction,
    maxRiskScore: options.maxRiskScore,
    minAmountUsd: options.minAmountUsd,
  }).filter((item) => !options.requirePayoutSignal || hasPayoutSignal(item));

  const audited = [];
  for (const item of candidates) {
    try {
      audited.push({
        item,
        audit: await auditCandidate({
          issueUrl: item.url,
          maxCommentsForFullAudit: options.maxCommentsForFullAudit,
          maxRelatedPulls: options.maxRelatedPulls,
          searchLimit: options.searchLimit,
        }),
      });
    } catch (error) {
      audited.push({
        item,
        audit: {
          recommendation: 'audit-error',
          reasons: [error instanceof Error ? error.message : String(error)],
          competition_score: Number.POSITIVE_INFINITY,
          issue: { title: item.title, url: item.url, state: 'unknown' },
          counts: {},
          related_pull_requests: [],
        },
      });
    }
  }
  return filterAudited(audited, options);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  process.stdout.write(formatAudited(await auditShortlist(options), options.format));
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

function markdownCell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replace(/\s+/g, ' ').trim();
}

function hasPayoutSignal(item) {
  const labels = (item.labels ?? []).join(' ');
  const signals = (item.signals ?? []).join(' ');
  const title = item.title ?? '';
  return /\b(bounty|reward|prize|payout|compensation|MRWK\/MergeWork)\b/i.test(signals) ||
    /\b(bounty|reward|price|external|\$\d+|\d+\s?(?:USD|USDC|MRWK))\b/i.test(`${title} ${labels}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
