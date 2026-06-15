import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRssFeed } from '../scripts/feed-rss.mjs';

const feed = {
  generated_at: '2026-06-15T08:00:00Z',
  items: [
    {
      score: 72,
      repo: 'example/repo',
      title: 'Fix payout loop',
      url: 'https://github.com/example/repo/issues/12',
      updated_at: '2026-06-15T07:00:00Z',
      opportunity_class: 'quick-win',
      effort_score: 18,
      signals: ['bounty', 'x402'],
      risk_flags: [{ label: 'competition-noise' }],
      decision_notes: ['parsed payout amount: $100']
    },
    {
      score: 60,
      repo: 'example/repo',
      title: 'XML & RSS <safe>',
      url: 'https://github.com/example/repo/issues/13',
      updated_at: '2026-06-15T06:00:00Z',
      signals: [],
      risk_flags: [],
      decision_notes: []
    },
  ],
};

test('buildRssFeed renders channel metadata and escaped items', () => {
  const xml = buildRssFeed(feed);

  assert.match(xml, /<rss version="2\.0" xmlns:atom="http:\/\/www\.w3\.org\/2005\/Atom">/);
  assert.match(xml, /<title>Bounty Radar<\/title>/);
  assert.match(xml, /<atom:link href="https:\/\/go165\.github\.io\/bounty-radar\/feed\/latest\.xml" rel="self" type="application\/rss\+xml" \/>/);
  assert.match(xml, /<title>XML &amp; RSS &lt;safe&gt;<\/title>/);
  assert.match(xml, /<description>example\/repo \| score 72/);
  assert.match(xml, /<description>.*opportunity: quick-win.*effort: 18.*signals: bounty, x402.*risk: competition-noise/s);
});

test('buildRssFeed orders newer items first', () => {
  const xml = buildRssFeed(feed);
  const firstIndex = xml.indexOf('Fix payout loop');
  const secondIndex = xml.indexOf('XML &amp; RSS &lt;safe&gt;');

  assert(firstIndex < secondIndex);
});
