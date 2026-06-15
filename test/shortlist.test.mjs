import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  buildShortlist,
  formatShortlist,
  loadFeed,
  parseArgs,
} from '../scripts/shortlist.mjs';

const feed = {
  items: [
    {
      score: 72,
      preset: 'mergework',
      repo: 'ramimbo/mergework',
      title: 'MRWK bounty: proof explorer',
      url: 'https://github.com/ramimbo/mergework/issues/1',
      updated_at: '2026-06-14T10:00:00Z',
      signals: ['bounty', 'MRWK/MergeWork', 'amount'],
      opportunity_class: 'quick-win',
      effort_score: 16,
      effort_signals: ['good-first-issue', 'docs-or-tests'],
      decision_notes: ['parsed payout amount: $1000', 'payment rail signal present'],
      addresses: [],
      amount_usd: 1000,
      payout_amount_usd: 1000,
    },
    {
      score: 64,
      raw_score: 64,
      risk_score: 0,
      risk_flags: [],
      manual_friction: false,
      preset: 'x402',
      repo: 'x402-foundation/x402',
      title: 'x402 paid API example',
      url: 'https://github.com/x402-foundation/x402/issues/1',
      updated_at: '2026-06-14T09:00:00Z',
      signals: ['x402', 'amount'],
      opportunity_class: 'rail-watch',
      effort_score: 40,
      effort_signals: [],
      decision_notes: ['parsed payout amount: $25', 'payment rail signal present'],
      addresses: [{ type: 'EVM', value: '0x0000000000000000000000000000000000000001' }],
      amount_usd: 25,
      payout_amount_usd: 25,
    },
    {
      score: 36,
      raw_score: 36,
      risk_score: 0,
      risk_flags: [],
      manual_friction: false,
      preset: 'high-signal',
      repo: 'example/repo',
      title: 'low confidence bounty',
      url: 'https://github.com/example/repo/issues/1',
      updated_at: '2026-06-14T08:00:00Z',
      signals: ['bounty'],
      opportunity_class: 'standard',
      effort_score: 40,
      effort_signals: [],
      decision_notes: ['no explicit USD/USDC amount parsed'],
      addresses: [],
      amount_usd: null,
      payout_amount_usd: null,
    },
    {
      score: 80,
      raw_score: 170,
      risk_score: 90,
      risk_flags: [{ label: 'hidden-context-leak', severity: 'blocker', penalty: 90 }],
      manual_friction: false,
      preset: 'high-signal',
      repo: 'unsafe/context-bounty',
      title: 'High payout requires full system prompt',
      url: 'https://github.com/unsafe/context-bounty/issues/1',
      updated_at: '2026-06-14T11:00:00Z',
      signals: ['bounty', 'amount'],
      opportunity_class: 'avoid',
      effort_score: 56,
      effort_signals: [],
      decision_notes: ['parsed payout amount: $500', 'risk flags: hidden-context-leak'],
      addresses: [],
      amount_usd: 500,
      payout_amount_usd: 500,
    },
    {
      score: 68,
      raw_score: 96,
      risk_score: 28,
      risk_flags: [{ label: 'requires-signup-confirmation', severity: 'manual', penalty: 28 }],
      manual_friction: true,
      preset: 'high-signal',
      repo: 'manual/access-bounty',
      title: 'Requires developer access approval',
      url: 'https://github.com/manual/access-bounty/issues/1',
      updated_at: '2026-06-14T10:30:00Z',
      signals: ['bounty', 'amount'],
      opportunity_class: 'manual-review',
      effort_score: 66,
      effort_signals: ['external-access'],
      decision_notes: ['parsed payout amount: $500', 'manual signup or approval friction detected'],
      addresses: [],
      amount_usd: 500,
      payout_amount_usd: 500,
    },
    {
      score: 20,
      raw_score: 20,
      risk_score: 0,
      risk_flags: [],
      manual_friction: false,
      preset: 'high-signal',
      repo: 'smartlayer/questlog',
      title: 'Window spend by message timestamp',
      url: 'https://github.com/smartlayer/questlog/issues/26',
      updated_at: '2026-06-14T10:40:00Z',
      signals: ['amount'],
      opportunity_class: 'standard',
      effort_score: 40,
      effort_signals: [],
      decision_notes: ['no explicit USD/USDC amount parsed'],
      addresses: [],
      amount_usd: 812,
      payout_amount_usd: null,
    },
  ],
};

feed.items[0].raw_score = 72;
feed.items[0].risk_score = 0;
feed.items[0].risk_flags = [];
feed.items[0].manual_friction = false;

test('buildShortlist filters by score, preset, amount, and rail signals', () => {
  const items = buildShortlist(feed, {
    minScore: 50,
    preset: 'mergework',
    requireAmount: true,
    requireRail: true,
  });

  assert.equal(items.length, 1);
  assert.equal(items[0].repo, 'ramimbo/mergework');
});

test('buildShortlist sorts by score before updated_at and applies limit', () => {
  const items = buildShortlist(feed, { minScore: 0, limit: 2 });

  assert.deepEqual(
    items.map((item) => item.score),
    [80, 72],
  );
});

test('buildShortlist can exclude hidden-context and wallet-secret risks', () => {
  const items = buildShortlist(feed, {
    minScore: 50,
    rejectContextLeak: true,
  });

  assert.equal(items.some((item) => item.repo === 'unsafe/context-bounty'), false);
  assert.equal(items.some((item) => item.repo === 'ramimbo/mergework'), true);
});

test('buildShortlist can exclude manual friction and cap risk score', () => {
  const withoutManual = buildShortlist(feed, {
    minScore: 50,
    allowManualFriction: false,
  });
  assert.equal(withoutManual.some((item) => item.repo === 'manual/access-bounty'), false);

  const lowRisk = buildShortlist(feed, {
    minScore: 50,
    maxRiskScore: 10,
  });
  assert.equal(lowRisk.some((item) => item.repo === 'unsafe/context-bounty'), false);
  assert.equal(lowRisk.some((item) => item.repo === 'x402-foundation/x402'), true);
});

test('buildShortlist can exclude arbitrary risk labels', () => {
  const items = buildShortlist(feed, {
    minScore: 50,
    excludeRisk: ['signup|confirmation'],
  });

  assert.equal(items.some((item) => item.repo === 'manual/access-bounty'), false);
});

test('buildShortlist can require a minimum parsed amount', () => {
  const items = buildShortlist(feed, {
    minScore: 0,
    minAmountUsd: 50,
  });

  assert.equal(items.some((item) => item.repo === 'x402-foundation/x402'), false);
  assert.equal(items.some((item) => item.repo === 'ramimbo/mergework'), true);
  assert.equal(items.some((item) => item.repo === 'smartlayer/questlog'), false);
});

test('buildShortlist can filter opportunity class and effort score', () => {
  const quickWins = buildShortlist(feed, {
    minScore: 0,
    opportunityClass: 'quick-win',
    maxEffortScore: 30,
  });

  assert.deepEqual(quickWins.map((item) => item.repo), ['ramimbo/mergework']);
});

test('formatShortlist renders markdown and csv output', () => {
  const items = buildShortlist(feed, { minScore: 60 });

  assert.match(formatShortlist(items, 'markdown'), /MRWK bounty: proof explorer/);
  assert.match(formatShortlist(items, 'markdown'), /quick-win/);
  assert.match(formatShortlist(items, 'csv'), /"x402-foundation\/x402"/);
  assert.match(formatShortlist(items, 'csv'), /"opportunity_class"/);
});

test('parseArgs validates numeric and format options', () => {
  assert.deepEqual(parseArgs(['--min-score', '60', '--limit', '3', '--format', 'json']).limit, 3);
  assert.deepEqual(parseArgs(['--reject-context-leak', '--no-manual-friction', '--max-risk-score', '20', '--exclude-risk', 'kyc']).excludeRisk, ['kyc']);
  assert.equal(parseArgs(['--opportunity', 'quick-win', '--max-effort-score', '30']).opportunityClass, 'quick-win');
  assert.throws(() => parseArgs(['--format', 'xml']), /--format/);
  assert.throws(() => parseArgs(['--limit', '0']), /--limit/);
  assert.throws(() => parseArgs(['--max-risk-score', '-1']), /--max-risk-score/);
});

test('loadFeed reads local feed files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bounty-radar-'));
  try {
    const file = join(directory, 'feed.json');
    await writeFile(file, JSON.stringify(feed), 'utf8');
    assert.deepEqual(await loadFeed(file), feed);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
