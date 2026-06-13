const presets = [
  {
    id: 'high-signal',
    name: 'High-signal bounties',
    description: 'Broad GitHub bounty scan with reward and paid-work terms.',
    query: 'is:issue is:open bounty OR reward OR paid',
  },
  {
    id: 'base-usdc',
    name: 'Base / USDC',
    description: 'Find onchain payment issues mentioning Base or USDC.',
    query: 'is:issue is:open bounty USDC Base',
  },
  {
    id: 'x402',
    name: 'x402 paid APIs',
    description: 'Watch paid API, HTTP 402, and x402 integration work.',
    query: 'is:issue is:open x402 OR "HTTP 402" OR "paid API"',
  },
  {
    id: 'mergework',
    name: 'MergeWork / MRWK',
    description: 'Track MRWK and MergeWork bounty references.',
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

const addressPatterns = [
  { type: 'EVM', regex: /0x[a-fA-F0-9]{40}/g },
  { type: 'Stellar', regex: /G[A-Z2-7]{55}/g },
  { type: 'MRWK', regex: /mrwk1[a-z0-9]{20,80}/gi },
];

const WATCHLIST_KEY = 'bounty-radar-watchlists';
const REPO_STATS_LIMIT = 12;
const repoCache = new Map();
let apiRateRemaining = null;

let selectedPreset = presets[0];
let currentResults = [];

const elements = {
  presets: document.querySelector('#presets'),
  form: document.querySelector('#searchForm'),
  keywords: document.querySelector('#keywords'),
  token: document.querySelector('#token'),
  limit: document.querySelector('#limit'),
  scanButton: document.querySelector('#scanButton'),
  copyShareLink: document.querySelector('#copyShareLink'),
  saveWatchlist: document.querySelector('#saveWatchlist'),
  exportCsv: document.querySelector('#exportCsv'),
  savedWatchlists: document.querySelector('#savedWatchlists'),
  savedCount: document.querySelector('#savedCount'),
  results: document.querySelector('#results'),
  resultCount: document.querySelector('#resultCount'),
  topScore: document.querySelector('#topScore'),
  rateLimit: document.querySelector('#rateLimit'),
  statusText: document.querySelector('#statusText'),
  addressInput: document.querySelector('#addressInput'),
  addressResult: document.querySelector('#addressResult'),
  template: document.querySelector('#resultCardTemplate'),
};

elements.token.value = sessionStorage.getItem('githubToken') ?? '';

function applyUrlState() {
  const params = new URLSearchParams(window.location.search);
  const preset = presets.find((item) => item.id === params.get('preset'));
  if (preset) selectedPreset = preset;
  if (params.has('q')) elements.keywords.value = params.get('q') ?? '';
  if (['20', '40', '80'].includes(params.get('limit'))) elements.limit.value = params.get('limit');
}

function renderPresets() {
  elements.presets.innerHTML = '';
  for (const preset of presets) {
    const button = document.createElement('button');
    button.className = 'preset';
    button.type = 'button';
    button.setAttribute('aria-pressed', String(preset.id === selectedPreset.id));
    button.innerHTML = `<strong>${preset.name}</strong><span>${preset.description}</span>`;
    button.addEventListener('click', () => {
      selectedPreset = preset;
      renderPresets();
    });
    elements.presets.append(button);
  }
}

function buildQuery() {
  const extra = elements.keywords.value.trim();
  return [selectedPreset.query, extra].filter(Boolean).join(' ');
}

function buildShareUrl() {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('preset', selectedPreset.id);
  const extra = elements.keywords.value.trim();
  if (extra) url.searchParams.set('q', extra);
  url.searchParams.set('limit', elements.limit.value);
  return url.toString();
}

async function copyShareLink() {
  const shareUrl = buildShareUrl();
  window.history.replaceState(null, '', shareUrl);
  try {
    await navigator.clipboard.writeText(shareUrl);
    elements.statusText.textContent = 'Share link copied to clipboard.';
  } catch (_error) {
    elements.statusText.textContent = shareUrl;
  }
}

function readWatchlists() {
  try {
    const value = JSON.parse(localStorage.getItem(WATCHLIST_KEY) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch (_error) {
    return [];
  }
}

function writeWatchlists(watchlists) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlists.slice(0, 12)));
  renderWatchlists();
}

function saveCurrentWatchlist() {
  const extra = elements.keywords.value.trim();
  const watchlist = {
    id: `${selectedPreset.id}:${extra}:${elements.limit.value}`,
    presetId: selectedPreset.id,
    presetName: selectedPreset.name,
    keywords: extra,
    limit: elements.limit.value,
  };
  const watchlists = readWatchlists().filter((item) => item.id !== watchlist.id);
  writeWatchlists([watchlist, ...watchlists]);
  elements.statusText.textContent = `Saved watchlist: ${watchlistLabel(watchlist)}.`;
}

function renderWatchlists() {
  const watchlists = readWatchlists();
  elements.savedWatchlists.innerHTML = '';
  elements.savedCount.textContent = String(watchlists.length);

  for (const watchlist of watchlists) {
    const chip = document.createElement('span');
    chip.className = 'watchlist-chip';

    const load = document.createElement('button');
    load.type = 'button';
    load.textContent = watchlistLabel(watchlist);
    load.title = 'Load watchlist';
    load.className = 'watchlist-load';
    load.addEventListener('click', () => loadWatchlist(watchlist));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'x';
    remove.title = 'Remove watchlist';
    remove.addEventListener('click', () => removeWatchlist(watchlist.id));

    chip.append(load, remove);
    elements.savedWatchlists.append(chip);
  }
}

function loadWatchlist(watchlist) {
  selectedPreset = presets.find((preset) => preset.id === watchlist.presetId) ?? selectedPreset;
  elements.keywords.value = watchlist.keywords ?? '';
  elements.limit.value = watchlist.limit ?? '40';
  renderPresets();
  elements.statusText.textContent = `Loaded watchlist: ${watchlistLabel(watchlist)}.`;
}

function removeWatchlist(id) {
  writeWatchlists(readWatchlists().filter((watchlist) => watchlist.id !== id));
}

function watchlistLabel(watchlist) {
  return [watchlist.presetName, watchlist.keywords].filter(Boolean).join(' + ');
}

async function scanGitHub(event) {
  event.preventDefault();
  const token = elements.token.value.trim();
  if (token) {
    sessionStorage.setItem('githubToken', token);
  } else {
    sessionStorage.removeItem('githubToken');
  }

  const query = buildQuery();
  const perPage = Math.min(Number(elements.limit.value), 100);
  const url = new URL('https://api.github.com/search/issues');
  url.searchParams.set('q', query);
  url.searchParams.set('sort', 'updated');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', String(perPage));

  elements.scanButton.disabled = true;
  elements.scanButton.textContent = 'Scanning...';
  elements.statusText.textContent = `Scanning GitHub for: ${query}`;
  elements.results.innerHTML = '<div class="empty">Loading issues from GitHub Search API...</div>';

  try {
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    updateRateLimit(response.headers.get('x-ratelimit-remaining'));

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`${response.status} ${response.statusText}: ${message}`);
    }

    const payload = await response.json();
    currentResults = (payload.items ?? [])
      .map(scoreIssue)
      .sort((a, b) => b.score - a.score || new Date(b.updatedAt) - new Date(a.updatedAt));
    await enrichWithRepoStats(currentResults, token);
    renderResults(currentResults);
  } catch (error) {
    elements.results.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
    elements.statusText.textContent = 'Scan failed. Add a GitHub token if you hit rate limits.';
  } finally {
    elements.scanButton.disabled = false;
    elements.scanButton.textContent = 'Scan GitHub';
  }
}

function scoreIssue(issue) {
  const text = `${issue.title ?? ''}\n${issue.body ?? ''}`;
  const labels = (issue.labels ?? []).map((label) => label.name ?? '').filter(Boolean);
  const labelText = labels.join(' ');
  const signals = [];
  let score = 0;

  for (const signal of signalPatterns) {
    if (signal.regex.test(text) || signal.regex.test(labelText)) {
      signals.push(signal.label);
      score += signal.points;
    }
  }

  if (/\b(bounty|reward|paid|help wanted)\b/i.test(labelText)) {
    signals.push('label match');
    score += 8;
  }

  const addresses = extractAddresses(text);
  if (addresses.length > 0) {
    signals.push('payout address');
    score += 20;
  }

  const daysOld = (Date.now() - new Date(issue.updated_at).getTime()) / 86400000;
  if (daysOld > 120) {
    signals.push('stale');
    score -= 8;
  }

  const repo = issue.repository_url?.replace('https://api.github.com/repos/', '') ?? 'unknown/repo';

  return {
    title: issue.title,
    url: issue.html_url,
    repo,
    updatedAt: issue.updated_at,
    summary: summarize(issue.body),
    labels,
    signals: [...new Set(signals)],
    addresses,
    repoStats: null,
    score: Math.max(0, score),
  };
}

async function enrichWithRepoStats(results, token) {
  const repos = [...new Set(results.map((result) => result.repo).filter((repo) => repo !== 'unknown/repo'))]
    .slice(0, REPO_STATS_LIMIT);
  for (const repo of repos) {
    if (apiRateRemaining === 0) break;
    await fetchRepoStats(repo, token);
  }

  for (const result of results) {
    const stats = repoCache.get(result.repo) ?? null;
    result.repoStats = stats;
    const qualityPoints = repoQualityPoints(stats);
    if (qualityPoints > 0) {
      result.score += qualityPoints;
      result.signals = [...new Set([...result.signals, 'repo quality'])];
    }
  }

  results.sort((a, b) => b.score - a.score || new Date(b.updatedAt) - new Date(a.updatedAt));
}

async function fetchRepoStats(repo, token) {
  if (repoCache.has(repo)) return repoCache.get(repo);

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    updateRateLimit(response.headers.get('x-ratelimit-remaining'));
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

    const data = await response.json();
    const stats = {
      stars: data.stargazers_count ?? 0,
      forks: data.forks_count ?? 0,
      openIssues: data.open_issues_count ?? 0,
      updatedAt: data.pushed_at ?? data.updated_at,
      archived: Boolean(data.archived),
    };
    repoCache.set(repo, stats);
    return stats;
  } catch (_error) {
    repoCache.set(repo, null);
    return null;
  }
}

function repoQualityPoints(stats) {
  if (!stats || stats.archived) return 0;
  let points = 0;
  if (stats.stars >= 1000) points += 8;
  else if (stats.stars >= 100) points += 5;
  else if (stats.stars >= 25) points += 3;
  if (stats.forks >= 50) points += 3;
  if ((Date.now() - new Date(stats.updatedAt).getTime()) / 86400000 <= 45) points += 4;
  return points;
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

function summarize(body) {
  const text = (body ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 220 ? `${text.slice(0, 217)}...` : text || 'No issue body returned by GitHub Search.';
}

function renderResults(results) {
  elements.resultCount.textContent = String(results.length);
  elements.topScore.textContent = String(results[0]?.score ?? 0);
  elements.exportCsv.disabled = results.length === 0;

  if (results.length === 0) {
    elements.results.innerHTML = '<div class="empty">No matching issues found. Try broader keywords.</div>';
    elements.statusText.textContent = 'No results returned.';
    return;
  }

  elements.statusText.textContent = `Ranked ${results.length} issues by payout signal strength.`;
  elements.results.innerHTML = '';

  for (const result of results) {
    const node = elements.template.content.cloneNode(true);
    node.querySelector('[data-score]').textContent = result.score;
    node.querySelector('[data-repo]').textContent = result.repo;
    node.querySelector('[data-updated]').textContent = `Updated ${formatDate(result.updatedAt)}`;
    const title = node.querySelector('[data-title]');
    title.textContent = result.title;
    title.href = result.url;
    node.querySelector('[data-summary]').textContent = result.summary;
    node.querySelector('[data-repo-stats]').append(...repoStatNodes(result.repoStats));
    node.querySelector('[data-signals]').append(...pillNodes(result.signals, 'signal'));
    node.querySelector('[data-addresses]').append(...pillNodes(result.addresses.map((a) => `${a.type}: ${shorten(a.value)}`), 'address'));
    elements.results.append(node);
  }
}

function repoStatNodes(stats) {
  if (!stats) return [createPill('repo stats unavailable', '')];
  return [
    createPill(`${formatNumber(stats.stars)} stars`, ''),
    createPill(`${formatNumber(stats.forks)} forks`, ''),
    createPill(`pushed ${formatDate(stats.updatedAt)}`, ''),
    createPill(stats.archived ? 'archived' : 'active repo', 'signal'),
  ];
}

function pillNodes(values, className) {
  if (values.length === 0) {
    return [createPill('no strong signal yet', '')];
  }
  return values.map((value) => createPill(value, className));
}

function createPill(text, className) {
  const span = document.createElement('span');
  span.className = ['pill', className].filter(Boolean).join(' ');
  span.textContent = text;
  return span;
}

function exportCsv() {
  const header = ['score', 'repo', 'title', 'url', 'updated_at', 'signals', 'addresses'];
  const rows = currentResults.map((item) => [
    item.score,
    item.repo,
    item.title,
    item.url,
    item.updatedAt,
    item.signals.join('|'),
    item.addresses.map((address) => `${address.type}:${address.value}`).join('|'),
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'bounty-radar-shortlist.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function classifyAddress() {
  const value = elements.addressInput.value.trim();
  if (!value) {
    elements.addressResult.textContent = 'Paste an address to classify it.';
    return;
  }
  const match = addressPatterns.find((pattern) => new RegExp(`^${pattern.regex.source}$`, pattern.regex.flags.replace('g', '')).test(value));
  elements.addressResult.textContent = match
    ? `${match.type} payout address shape detected. Verify ownership and network before paying.`
    : 'Unknown address shape. Treat as unverified until the bounty owner documents payout instructions.';
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function updateRateLimit(value) {
  if (value === null) return;
  apiRateRemaining = Number(value);
  elements.rateLimit.textContent = value;
}

function shorten(value) {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

elements.form.addEventListener('submit', scanGitHub);
elements.copyShareLink.addEventListener('click', copyShareLink);
elements.saveWatchlist.addEventListener('click', saveCurrentWatchlist);
elements.exportCsv.addEventListener('click', exportCsv);
elements.addressInput.addEventListener('input', classifyAddress);
applyUrlState();
renderPresets();
renderWatchlists();
