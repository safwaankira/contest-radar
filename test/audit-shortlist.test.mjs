import test from 'node:test';
import assert from 'node:assert/strict';
import { filterAudited, formatAudited, parseArgs } from '../scripts/audit-shortlist.mjs';

const rows = [
  {
    item: { score: 50, repo: 'a/good', title: 'Good', url: 'https://github.com/a/good/issues/1' },
    audit: { recommendation: 'consider', competition_score: 0 },
  },
  {
    item: { score: 80, repo: 'b/crowded', title: 'Crowded', url: 'https://github.com/b/crowded/issues/2' },
    audit: { recommendation: 'avoid-unless-clearly-superior', competition_score: 80 },
  },
  {
    item: { score: 70, repo: 'c/noisy', title: 'Noisy', url: 'https://github.com/c/noisy/issues/3' },
    audit: { recommendation: 'consider', competition_score: 60 },
  },
];

test('filterAudited keeps only allowed recommendation and competition score', () => {
  const filtered = filterAudited(rows, {
    recommendation: ['consider'],
    maxCompetitionScore: 40,
  });

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].item.repo, 'a/good');
});

test('parseArgs supports audit-shortlist filters', () => {
  const options = parseArgs([
    '--limit',
    '5',
    '--max-competition-score',
    '20',
    '--min-amount-usd',
    '100',
    '--max-comments-full-audit',
    '10',
    '--max-related-pulls',
    '3',
    '--search-limit',
    '4',
    '--require-rail',
    '--allow-no-payout-signal',
    '--format',
    'json',
  ]);
  assert.equal(options.limit, 5);
  assert.equal(options.maxCompetitionScore, 20);
  assert.equal(options.minAmountUsd, 100);
  assert.equal(options.maxCommentsForFullAudit, 10);
  assert.equal(options.maxRelatedPulls, 3);
  assert.equal(options.searchLimit, 4);
  assert.equal(options.requireRail, true);
  assert.equal(options.requirePayoutSignal, false);
  assert.equal(options.format, 'json');
  assert.throws(() => parseArgs(['--format', 'csv']), /--format/);
});

test('formatAudited renders empty and markdown outputs', () => {
  assert.match(formatAudited([], 'markdown'), /No audited candidates/);
  assert.match(formatAudited([rows[0]], 'markdown'), /a\/good/);
  assert.match(formatAudited([rows[0]], 'json'), /"competition_score": 0/);
});
