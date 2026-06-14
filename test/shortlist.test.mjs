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
      addresses: [],
    },
    {
      score: 64,
      preset: 'x402',
      repo: 'x402-foundation/x402',
      title: 'x402 paid API example',
      url: 'https://github.com/x402-foundation/x402/issues/1',
      updated_at: '2026-06-14T09:00:00Z',
      signals: ['x402', 'amount'],
      addresses: [{ type: 'EVM', value: '0x0000000000000000000000000000000000000001' }],
    },
    {
      score: 36,
      preset: 'high-signal',
      repo: 'example/repo',
      title: 'low confidence bounty',
      url: 'https://github.com/example/repo/issues/1',
      updated_at: '2026-06-14T08:00:00Z',
      signals: ['bounty'],
      addresses: [],
    },
  ],
};

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
    [72, 64],
  );
});

test('formatShortlist renders markdown and csv output', () => {
  const items = buildShortlist(feed, { minScore: 60 });

  assert.match(formatShortlist(items, 'markdown'), /MRWK bounty: proof explorer/);
  assert.match(formatShortlist(items, 'csv'), /"x402-foundation\/x402"/);
});

test('parseArgs validates numeric and format options', () => {
  assert.deepEqual(parseArgs(['--min-score', '60', '--limit', '3', '--format', 'json']).limit, 3);
  assert.throws(() => parseArgs(['--format', 'xml']), /--format/);
  assert.throws(() => parseArgs(['--limit', '0']), /--limit/);
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
