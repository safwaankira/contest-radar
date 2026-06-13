import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const PORT = Number(process.env.PORT ?? 8787);
const FEED_PATH = process.env.FEED_PATH ?? new URL('../../feed/latest.json', import.meta.url);
const PAYMENT_TOKEN = process.env.PAYMENT_TOKEN ?? 'demo-paid';
const PUBLIC_DEMO_URL = 'https://go165.github.io/bounty-radar/feed/latest.json';

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    if (request.method === 'OPTIONS') {
      return send(response, 204, null);
    }

    if (request.method !== 'GET') {
      return send(response, 405, { error: 'method_not_allowed' });
    }

    if (url.pathname === '/health') {
      return send(response, 200, { ok: true, service: 'bounty-radar-paid-alert-api' });
    }

    if (url.pathname === '/v1/alerts') {
      const feed = await loadFeed();
      const items = filterAlerts(feed.items, url);
      return send(response, 200, {
        generated_at: feed.generated_at,
        count: items.length,
        items: items.slice(0, publicLimit(url)),
      });
    }

    if (url.pathname === '/v1/paid/alerts') {
      if (!isPaymentSatisfied(request)) {
        return sendPaymentRequired(response, url);
      }
      const feed = await loadFeed();
      const items = filterAlerts(feed.items, url);
      return send(response, 200, {
        generated_at: feed.generated_at,
        paid: true,
        count: items.length,
        items,
      });
    }

    return send(response, 404, {
      error: 'not_found',
      routes: ['/health', '/v1/alerts', '/v1/paid/alerts'],
    });
  } catch (error) {
    return send(response, 500, { error: 'internal_error', message: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Bounty Radar paid alert API listening on http://localhost:${PORT}`);
});

async function loadFeed() {
  return JSON.parse(await readFile(FEED_PATH, 'utf8'));
}

function filterAlerts(items, url) {
  const minScore = Number(url.searchParams.get('min_score') ?? 0);
  const preset = url.searchParams.get('preset');
  const repo = url.searchParams.get('repo');
  return items.filter((item) => {
    if (Number.isFinite(minScore) && item.score < minScore) return false;
    if (preset && item.preset !== preset) return false;
    if (repo && item.repo !== repo) return false;
    return true;
  });
}

function publicLimit(url) {
  const limit = Number(url.searchParams.get('limit') ?? 10);
  if (!Number.isFinite(limit)) return 10;
  return Math.min(Math.max(limit, 1), 20);
}

function isPaymentSatisfied(request) {
  if (process.env.BYPASS_PAYMENT === 'true') return true;
  return request.headers['x-payment'] === PAYMENT_TOKEN;
}

function sendPaymentRequired(response, url) {
  return send(response, 402, {
    error: 'payment_required',
    message: 'Send a valid X-Payment header to unlock the full alert feed. This demo shape can be replaced with an x402 facilitator verifier.',
    accepts: [
      {
        scheme: 'x402-demo',
        network: 'base-sepolia',
        asset: 'USDC',
        max_amount: '0.01',
        resource: `${url.origin}/v1/paid/alerts`,
      },
    ],
    free_preview: `${url.origin}/v1/alerts`,
    public_feed: PUBLIC_DEMO_URL,
  });
}

function send(response, status, payload) {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Payment',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(payload === null ? '' : `${JSON.stringify(payload, null, 2)}\n`);
}
