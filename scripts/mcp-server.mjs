#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { loadFeed, buildShortlist, formatShortlist } from './shortlist.mjs';
import { SCAN_PRICE, SITE_URL } from '../lib/config.js';

const DEFAULT_FEED_URL = 'https://contest-radar-celo.vercel.app/feed/latest.json';
const SERVER_INFO = { name: 'contest-radar', version: '0.3.0' };
const PROTOCOL_VERSION = '2024-11-05';

export const tools = [
  {
    name: 'search_bounties',
    description: 'Search today\'s free Contest Radar feed: open crypto contests and bounties from GitHub, poidh, X and Reddit, ranked by prize, time left, effort, risk and competition.',
    inputSchema: {
      type: 'object',
      properties: {
        feed: {
          type: 'string',
          description: 'Feed URL or local JSON file. Defaults to the hosted daily feed.',
        },
        min_score: {
          type: 'number',
          minimum: 0,
          description: 'Minimum worth-entering score (0-100). Default: 50.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Maximum number of items to return. Default: 10.',
        },
        preset: {
          type: 'string',
          description: 'Filter by preset such as mergework, x402, base-usdc, or high-signal.',
        },
        signal: {
          type: 'string',
          description: 'Case-insensitive regex that must match one signal label.',
        },
        require_amount: {
          type: 'boolean',
          description: 'Require an amount-like payout signal.',
        },
        require_rail: {
          type: 'boolean',
          description: 'Require a USDC/Base/x402/MRWK/MergeWork payment rail signal.',
        },
        opportunity: {
          type: 'string',
          enum: ['quick-win', 'high-value', 'rail-watch', 'standard', 'manual-review', 'avoid'],
          description: 'Filter by opportunity class.',
        },
        max_effort_score: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'Maximum effort score. Lower usually means easier.',
        },
        min_amount_usd: {
          type: 'number',
          minimum: 0,
          description: 'Minimum parsed USD/USDC amount.',
        },
        format: {
          type: 'string',
          enum: ['markdown', 'json', 'csv'],
          description: 'Response format. Default: markdown.',
        },
      },
    },
  },
  {
    name: 'get_bounty',
    description: 'Get one feed item (contest or bounty) by its URL.',
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: {
          type: 'string',
          description: 'Item URL from the Contest Radar feed.',
        },
        feed: {
          type: 'string',
          description: 'Feed URL or local JSON file. Defaults to the hosted daily feed.',
        },
      },
    },
  },
  {
    name: 'scan_contests',
    description: `Paid personal scan: Contest Radar searches X, Reddit and poidh right now for your keywords, reads every hit and returns ranked contests you can enter. Costs $${Number(SCAN_PRICE) / 1e6} over x402 on Celo, paid from the wallet in CONTEST_RADAR_PAYER_KEY (USDT, USDC or USAT); refunded automatically if the paid sources fail. Takes about 40 seconds.`,
    inputSchema: {
      type: 'object',
      required: ['keywords'],
      properties: {
        keywords: { type: 'string', minLength: 3, maxLength: 80, description: 'Your niche, e.g. "meme OR design" or "solana dev".' },
        limit: { type: 'integer', minimum: 1, maximum: 30, description: 'Maximum items to return. Default: 10.' },
      },
    },
  },
];

export async function callTool(name, args = {}) {
  if (name === 'search_bounties') {
    const feed = await loadFeed(args.feed ?? DEFAULT_FEED_URL);
    const items = buildShortlist(feed, {
      minScore: numberArg(args.min_score, 50),
      limit: integerArg(args.limit, 10, { max: 50 }),
      preset: optionalString(args.preset),
      signal: optionalString(args.signal),
      requireAmount: Boolean(args.require_amount),
      requireRail: Boolean(args.require_rail),
      opportunityClass: optionalString(args.opportunity),
      maxEffortScore: numberArg(args.max_effort_score, Number.POSITIVE_INFINITY),
      minAmountUsd: numberArg(args.min_amount_usd, 0),
    });
    const format = args.format ?? 'markdown';
    if (!['markdown', 'json', 'csv'].includes(format)) {
      throw new Error('format must be markdown, json, or csv');
    }
    return {
      content: [{ type: 'text', text: formatShortlist(items, format) }],
    };
  }

  if (name === 'get_bounty') {
    const url = requiredString(args.url, 'url');
    const feed = await loadFeed(args.feed ?? DEFAULT_FEED_URL);
    const item = (feed.items ?? []).find((candidate) => candidate.url === url);
    if (!item) {
      throw new Error(`Bounty not found in feed: ${url}`);
    }
    return {
      content: [{ type: 'text', text: `${JSON.stringify(item, null, 2)}\n` }],
    };
  }

  if (name === 'scan_contests') {
    const keywords = requiredString(args.keywords, 'keywords');
    const key = process.env.CONTEST_RADAR_PAYER_KEY;
    if (!key) {
      return {
        isError: true,
        content: [{ type: 'text', text: `scan_contests pays $${Number(SCAN_PRICE) / 1e6} per scan from your own Celo wallet. Set CONTEST_RADAR_PAYER_KEY in this MCP server's env, or call ${SITE_URL}/api/scan from any x402 client, e.g.\n  buy curl --max-amount ${Number(SCAN_PRICE) / 1e6} -X POST -H 'content-type: application/json' -d '{"keywords":"${keywords.replace(/["'\\]/g, '')}"}' ${SITE_URL}/api/scan` }],
      };
    }
    const { paidScan } = await import('../lib/scan-client.js');
    const body = await paidScan({ keywords, privateKey: key });
    const items = (body.items ?? []).slice(0, integerArg(args.limit, 10, { max: 30 }));
    return {
      content: [{ type: 'text', text: `${JSON.stringify({ keywords, payment: body.payment, count: items.length, items }, null, 2)}\n` }],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

export async function handleJsonRpcMessage(message) {
  if (!message || typeof message !== 'object') {
    return jsonRpcError(null, -32600, 'Invalid Request');
  }

  const { id, method, params } = message;

  try {
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      };
    }

    if (typeof method === 'string' && method.startsWith('notifications/')) {
      return undefined;
    }

    if (method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools } };
    }

    if (method === 'tools/call') {
      const result = await callTool(params?.name, params?.arguments ?? {});
      return { jsonrpc: '2.0', id, result };
    }

    return jsonRpcError(id ?? null, -32601, `Method not found: ${method}`);
  } catch (error) {
    return jsonRpcError(id ?? null, -32000, error instanceof Error ? error.message : 'Unknown error');
  }
}

function numberArg(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error('numeric arguments must be non-negative');
  return number;
}

function integerArg(value, fallback, { max = Number.POSITIVE_INFINITY } = {}) {
  const number = numberArg(value, fallback);
  if (!Number.isInteger(number) || number < 1 || number > max) {
    throw new Error(`integer arguments must be between 1 and ${max}`);
  }
  return number;
}

function optionalString(value) {
  if (value === undefined || value === null || value === '') return undefined;
  return String(value);
}

function requiredString(value, name) {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${name} is required`);
  }
  return String(value);
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function runStdioServer() {
  // MCP's stdio transport is newline-delimited JSON. The base used LSP-style Content-Length frames;
  // detect which one the client speaks from its first bytes and answer in kind.
  let mode = null;
  let lineBuf = '';
  const reply = (response) => {
    if (!response) return;
    if (mode === 'framed') writeFrame(response);
    else process.stdout.write(`${JSON.stringify(response)}\n`);
  };
  const reader = new FramedJsonReader(async (message) => reply(await handleJsonRpcMessage(message)));

  process.stdin.on('data', (chunk) => {
    if (!mode) mode = /^\s*Content-Length:/i.test(chunk.toString('utf8', 0, 32)) ? 'framed' : 'lines';
    if (mode === 'framed') return reader.push(chunk);
    lineBuf += chunk.toString('utf8');
    let nl;
    while ((nl = lineBuf.indexOf('\n')) !== -1) {
      const line = lineBuf.slice(0, nl).trim();
      lineBuf = lineBuf.slice(nl + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { reply(jsonRpcError(null, -32700, 'Parse error')); continue; }
      void handleJsonRpcMessage(message).then(reply);
    }
  });
  process.stdin.on('error', (error) => {
    writeFrame(jsonRpcError(null, -32000, error.message));
  });
}

class FramedJsonReader {
  constructor(onMessage) {
    this.buffer = Buffer.alloc(0);
    this.onMessage = onMessage;
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length > 0) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return;

      const header = this.buffer.subarray(0, headerEnd).toString('utf8');
      const match = /^Content-Length:\s*(\d+)$/im.exec(header);
      if (!match) throw new Error('Missing Content-Length header');

      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (this.buffer.length < bodyEnd) return;

      const body = this.buffer.subarray(bodyStart, bodyEnd).toString('utf8');
      this.buffer = this.buffer.subarray(bodyEnd);
      void this.onMessage(JSON.parse(body));
    }
  }
}

function writeFrame(message) {
  const body = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runStdioServer().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
