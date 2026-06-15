import { execFileSync } from 'node:child_process';

const token = resolveGithubToken();
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'bounty-radar-audit-candidate',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

function resolveGithubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execFileSync('gh', ['auth', 'token'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

export function parseIssueRef(options) {
  if (options.issueUrl) {
    const match = options.issueUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\/(\d+)(?:[/?#].*)?$/i);
    if (!match) throw new Error('--issue-url must look like https://github.com/owner/repo/issues/123');
    return { repo: match[1], number: Number(match[2]) };
  }
  if (!options.repo || !options.issue) {
    throw new Error('Provide --issue-url or both --repo and --issue');
  }
  if (!/^[^/]+\/[^/]+$/.test(options.repo)) throw new Error('--repo must look like owner/name');
  const number = Number(options.issue);
  if (!Number.isInteger(number) || number < 1) throw new Error('--issue must be a positive integer');
  return { repo: options.repo, number };
}

export function extractPullNumbers(text) {
  const numbers = new Set();
  for (const match of text.matchAll(/\/pull\/(\d+)\b/gi)) numbers.add(Number(match[1]));
  for (const match of text.matchAll(/\bPR\s*#(\d+)\b/gi)) numbers.add(Number(match[1]));
  for (const match of text.matchAll(/\bpull request\s*#(\d+)\b/gi)) numbers.add(Number(match[1]));
  return [...numbers].sort((a, b) => a - b);
}

export function summarizeCompetition({ issue, comments, pullRequests }) {
  const claimComments = comments.filter((comment) => /(?:\/claim\b|\[claim\]|\bclaiming\b|\bbounty claim\b|I'd like to claim|I would like to claim)|submitted\s+#\d+|submitted .*pull\/\d+/i.test(comment.body ?? ''));
  const maintainerAccepted = comments.filter((comment) =>
    ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(comment.author_association ?? '') &&
    /\b(winner selected|rewarded|approved for payout|bounty paid|merged (?:in|as)|accepted (?:solution|implementation|winner|submission|PR|pull request))\b/i.test(comment.body ?? ''),
  );
  const openPrs = pullRequests.filter((pr) => pr.state === 'open');
  const mergedPrs = pullRequests.filter((pr) => pr.merged_at);
  const approvalMentions = comments.filter((comment) => /\bapproval review|approved review|mergeable_state=clean\b/i.test(comment.body ?? ''));

  const competitionScore =
    claimComments.length * 12 +
    openPrs.length * 25 +
    mergedPrs.length * 80 +
    maintainerAccepted.length * 90 +
    approvalMentions.length * 15;

  let recommendation = 'consider';
  const reasons = [];
  if (maintainerAccepted.length > 0 || mergedPrs.length > 0) {
    recommendation = 'stop';
    reasons.push('maintainer accepted/merged signal found');
  } else if (openPrs.length >= 2 || claimComments.length >= 2 || approvalMentions.length > 0) {
    recommendation = 'avoid-unless-clearly-superior';
    reasons.push('multiple competing claims or PRs found');
  } else if (issue.state !== 'open') {
    recommendation = 'stop';
    reasons.push(`issue is ${issue.state}`);
  }

  return {
    recommendation,
    reasons,
    competition_score: competitionScore,
    issue: {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      url: issue.html_url,
      updated_at: issue.updated_at,
    },
    counts: {
      comments: comments.length,
      claim_comments: claimComments.length,
      maintainer_accepted_comments: maintainerAccepted.length,
      related_pull_requests: pullRequests.length,
      open_pull_requests: openPrs.length,
      merged_pull_requests: mergedPrs.length,
      approval_mentions: approvalMentions.length,
    },
    related_pull_requests: pullRequests.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      draft: Boolean(pr.draft),
      merged_at: pr.merged_at,
      updated_at: pr.updated_at,
      author: pr.user?.login,
      url: pr.html_url,
    })),
  };
}

export function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      i += 1;
      return value;
    };
    if (arg === '--issue-url') options.issueUrl = next();
    else if (arg === '--repo') options.repo = next();
    else if (arg === '--issue') options.issue = next();
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

export function helpText() {
  return `Usage: node scripts/audit-candidate.mjs --issue-url <github-issue-url>

Options:
  --issue-url <url>     GitHub issue URL such as https://github.com/owner/repo/issues/123.
  --repo <owner/name>   Repository, used with --issue.
  --issue <number>      Issue number, used with --repo.
  -h, --help            Show this help.
`;
}

async function github(pathOrUrl) {
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `https://api.github.com${pathOrUrl}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`GitHub API failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function fetchAll(path, options = {}) {
  const rows = [];
  let url = `https://api.github.com${path}${path.includes('?') ? '&' : '?'}per_page=100`;
  while (url) {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`GitHub API failed: ${response.status} ${await response.text()}`);
    rows.push(...(await response.json()));
    if (rows.length >= (options.maxRows ?? Number.POSITIVE_INFINITY)) {
      return rows.slice(0, options.maxRows);
    }
    const link = response.headers.get('link') ?? '';
    url = parseNextLink(link);
  }
  return rows;
}

function parseNextLink(link) {
  const next = link.split(',').find((part) => part.includes('rel="next"'));
  return next?.match(/<([^>]+)>/)?.[1] ?? '';
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }

  process.stdout.write(`${JSON.stringify(await auditCandidate(options), null, 2)}\n`);
}

export async function auditCandidate(options) {
  const { repo, number } = parseIssueRef(options);
  const issue = await github(`/repos/${repo}/issues/${number}`);
  if (options.maxCommentsForFullAudit && Number(issue.comments ?? 0) > options.maxCommentsForFullAudit) {
    return noisyIssueSummary(issue, options.maxCommentsForFullAudit);
  }

  const comments = await fetchAll(`/repos/${repo}/issues/${number}/comments`, {
    maxRows: options.maxComments ?? Number.POSITIVE_INFINITY,
  });
  const text = `${issue.body ?? ''}\n${comments.map((comment) => comment.body ?? '').join('\n')}`;
  const pullNumbers = uniqueNumbers([
    ...extractPullNumbers(text),
    ...(await searchRelatedPullNumbers(repo, number, issue.title ?? '', options.searchLimit ?? 50)),
  ]).slice(0, options.maxRelatedPulls ?? Number.POSITIVE_INFINITY);
  const pullRequests = [];
  for (const pullNumber of pullNumbers) {
    try {
      pullRequests.push(await github(`/repos/${repo}/pulls/${pullNumber}`));
    } catch (error) {
      pullRequests.push({
        number: pullNumber,
        title: 'unavailable',
        state: 'unknown',
        draft: false,
        merged_at: null,
        updated_at: null,
        html_url: `https://github.com/${repo}/pull/${pullNumber}`,
        user: { login: 'unknown' },
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summarizeCompetition({ issue, comments, pullRequests });
}

function noisyIssueSummary(issue, maxCommentsForFullAudit) {
  return {
    recommendation: 'avoid-unless-clearly-superior',
    reasons: [`comment volume ${issue.comments} exceeds full-audit limit ${maxCommentsForFullAudit}`],
    competition_score: Number(issue.comments ?? 0) * 2,
    issue: {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      url: issue.html_url,
      updated_at: issue.updated_at,
    },
    counts: {
      comments: issue.comments ?? 0,
      claim_comments: null,
      maintainer_accepted_comments: null,
      related_pull_requests: null,
      open_pull_requests: null,
      merged_pull_requests: null,
      approval_mentions: null,
    },
    related_pull_requests: [],
  };
}

async function searchRelatedPullNumbers(repo, issueNumber, issueTitle, searchLimit = 50) {
  const titlePhrase = issueTitle
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3)
    .slice(0, 6)
    .join(' ');
  const queries = [
    `repo:${repo} is:pr ${issueNumber}`,
    titlePhrase ? `repo:${repo} is:pr "${titlePhrase}"` : '',
  ].filter(Boolean);

  const numbers = [];
  for (const query of queries) {
    const url = new URL('https://api.github.com/search/issues');
    url.searchParams.set('q', query);
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('per_page', String(Math.min(50, searchLimit)));
    try {
      const payload = await github(url.href);
      for (const item of payload.items ?? []) {
        if (item.pull_request) numbers.push(item.number);
      }
    } catch {
      // Search is an enrichment path; direct comment-linked PRs still provide evidence.
    }
  }
  return uniqueNumbers(numbers);
}

function uniqueNumbers(values) {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))].sort((a, b) => a - b);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
