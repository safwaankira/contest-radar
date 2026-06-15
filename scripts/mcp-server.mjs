#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { loadFeed, buildShortlist, formatShortlist } from './shortlist.mjs';

const DEFAULT_FEED_URL = 'https://go165.github.io/bounty-radar/feed/latest.json';
const SERVER_INFO = { name: 'bounty-radar', version: '0.1.0' };
const PROTOCOL_VERSION = '2024-11-05';

export const tools = [
  {
    name: 'search_bounties',
    description: 'Search the Bounty Radar feed for high-signal GitHub bounty issues.',
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
          description: 'Minimum payout signal score. Default: 50.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Maximum number of issues to return. Default: 10.',
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
    description: 'Get one bounty feed item by GitHub issue URL.',
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: {
          type: 'string',
          description: 'GitHub issue URL from the Bounty Radar feed.',
        },
        feed: {
          type: 'string',
          description: 'Feed URL or local JSON file. Defaults to the hosted daily feed.',
        },
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

    if (method === 'notifications/initialized') {
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
  const reader = new FramedJsonReader(async (message) => {
    const response = await handleJsonRpcMessage(message);
    if (response) writeFrame(response);
  });

  process.stdin.on('data', (chunk) => reader.push(chunk));
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
