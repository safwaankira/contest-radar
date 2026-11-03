import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('agent discovery document exposes public feed endpoints', async () => {
  const agent = JSON.parse(await readFile('.well-known/agent.json', 'utf8'));

  assert.equal(agent.name, 'Contest Radar');
  assert.equal(agent.homepage, 'https://contest-radar-celo.vercel.app');
  assert.equal(agent.repository, 'https://github.com/safwaankira/contest-radar');
  assert.equal(agent.endpoints.feed, 'https://contest-radar-celo.vercel.app/feed/latest.json');
  assert.equal(agent.endpoints.rss, 'https://contest-radar-celo.vercel.app/feed/latest.xml');
  assert.equal(agent.endpoints.schema, 'https://contest-radar-celo.vercel.app/feed/schema.json');
  assert(agent.capabilities.includes('RSS feed export for subscriptions'));
  assert.match(agent.integration.cli, /npm run shortlist/);
  assert.equal(agent.integration.mcp_stdio, 'node scripts/mcp-server.mjs');
  assert.deepEqual(agent.integration.mcp_tools, ['search_bounties', 'get_bounty', 'scan_contests']);
  assert(agent.limitations.some((item) => /not payout guarantees/i.test(item)));
});

test('llms.txt points agents to the same machine-readable feed surface', async () => {
  const text = await readFile('llms.txt', 'utf8');

  assert.match(text, /# Contest Radar/);
  assert.match(text, /https:\/\/contest-radar-celo\.vercel\.app\/feed\/latest\.json/);
  assert.match(text, /https:\/\/contest-radar-celo\.vercel\.app\/feed\/latest\.xml/);
  assert.match(text, /https:\/\/contest-radar-celo\.vercel\.app\/\.well-known\/agent\.json/);
  assert.match(text, /npm run shortlist -- --min-score 50/);
  assert.match(text, /node scripts\/mcp-server\.mjs/);
  assert.match(text, /search_bounties/);
});
