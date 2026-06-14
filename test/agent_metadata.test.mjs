import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('agent discovery document exposes public feed endpoints', async () => {
  const agent = JSON.parse(await readFile('.well-known/agent.json', 'utf8'));

  assert.equal(agent.name, 'Bounty Radar');
  assert.equal(agent.homepage, 'https://go165.github.io/bounty-radar/');
  assert.equal(agent.repository, 'https://github.com/go165/bounty-radar');
  assert.equal(agent.endpoints.feed, 'https://go165.github.io/bounty-radar/feed/latest.json');
  assert.equal(agent.endpoints.schema, 'https://go165.github.io/bounty-radar/feed/schema.json');
  assert.match(agent.integration.cli, /npm run shortlist/);
  assert(agent.limitations.some((item) => /not payout guarantees/i.test(item)));
});

test('llms.txt points agents to the same machine-readable feed surface', async () => {
  const text = await readFile('llms.txt', 'utf8');

  assert.match(text, /# Bounty Radar/);
  assert.match(text, /https:\/\/go165\.github\.io\/bounty-radar\/feed\/latest\.json/);
  assert.match(text, /https:\/\/go165\.github\.io\/bounty-radar\/\.well-known\/agent\.json/);
  assert.match(text, /npm run shortlist -- --min-score 50/);
});
