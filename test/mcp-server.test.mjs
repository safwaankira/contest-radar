import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { callTool, handleJsonRpcMessage, tools } from '../scripts/mcp-server.mjs';

const feed = {
  generated_at: '2026-06-15T00:00:00Z',
  items: [
    {
      score: 88,
      raw_score: 88,
      risk_score: 0,
      risk_flags: [],
      manual_friction: false,
      preset: 'x402',
      repo: 'x402-foundation/x402',
      title: 'x402 paid API quick win',
      url: 'https://github.com/x402-foundation/x402/issues/402',
      updated_at: '2026-06-15T10:00:00Z',
      signals: ['x402', 'USDC/Base', 'amount'],
      opportunity_class: 'quick-win',
      effort_score: 18,
      effort_signals: ['docs-or-tests'],
      decision_notes: ['parsed payout amount: $100', 'payment rail signal present'],
      addresses: [],
      amount_usd: 100,
      payout_amount_usd: 100,
    },
    {
      score: 44,
      raw_score: 44,
      risk_score: 0,
      risk_flags: [],
      manual_friction: false,
      preset: 'high-signal',
      repo: 'example/repo',
      title: 'generic bounty',
      url: 'https://github.com/example/repo/issues/1',
      updated_at: '2026-06-15T09:00:00Z',
      signals: ['bounty'],
      opportunity_class: 'standard',
      effort_score: 50,
      effort_signals: [],
      decision_notes: ['no explicit USD/USDC amount parsed'],
      addresses: [],
    },
  ],
};

test('tools list exposes bounty search and lookup tools', () => {
  assert.deepEqual(
    tools.map((tool) => tool.name),
    ['search_bounties', 'get_bounty'],
  );
});

test('search_bounties returns filtered markdown from a local feed', async () => {
  await withFeedFile(async (file) => {
    const result = await callTool('search_bounties', {
      feed: file,
      min_score: 50,
      require_rail: true,
      opportunity: 'quick-win',
      max_effort_score: 20,
    });

    assert.equal(result.content[0].type, 'text');
    assert.match(result.content[0].text, /x402 paid API quick win/);
    assert.doesNotMatch(result.content[0].text, /generic bounty/);
  });
});

test('get_bounty returns one feed item as JSON', async () => {
  await withFeedFile(async (file) => {
    const result = await callTool('get_bounty', {
      feed: file,
      url: 'https://github.com/x402-foundation/x402/issues/402',
    });

    const item = JSON.parse(result.content[0].text);
    assert.equal(item.repo, 'x402-foundation/x402');
    assert.equal(item.opportunity_class, 'quick-win');
  });
});

test('handleJsonRpcMessage supports initialize, tools/list, and tools/call', async () => {
  await withFeedFile(async (file) => {
    const initialize = await handleJsonRpcMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    assert.equal(initialize.result.serverInfo.name, 'bounty-radar');

    const list = await handleJsonRpcMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.equal(list.result.tools.length, 2);

    const called = await handleJsonRpcMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'search_bounties',
        arguments: { feed: file, min_score: 80, format: 'json' },
      },
    });

    assert.equal(called.id, 3);
    assert.equal(JSON.parse(called.result.content[0].text)[0].repo, 'x402-foundation/x402');
  });
});

test('handleJsonRpcMessage returns JSON-RPC errors for invalid tool calls', async () => {
  const response = await handleJsonRpcMessage({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'missing_tool' },
  });

  assert.equal(response.error.code, -32000);
  assert.match(response.error.message, /Unknown tool/);
});

async function withFeedFile(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'bounty-radar-mcp-'));
  try {
    const file = join(directory, 'feed.json');
    await writeFile(file, JSON.stringify(feed), 'utf8');
    await callback(file);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
