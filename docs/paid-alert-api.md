# Paid Alert API Deployment Guide

Bounty Radar produces a public JSON feed that can become a paid alert API for agents, dashboards, or teams that want a filtered stream of high-signal paid GitHub issues.

Feed URL:

```text
https://go165.github.io/bounty-radar/feed/latest.json
```

The feed shape is intentionally simple:

```json
{
  "generated_at": "2026-06-13T19:11:54.469Z",
  "count": 47,
  "items": [
    {
      "score": 72,
      "opportunity_class": "quick-win",
      "effort_score": 24,
      "preset": "mergework",
      "repo": "ramimbo/mergework",
      "title": "MRWK bounty: 450 MRWK - Phase 2B snapshot Merkle proofs",
      "url": "https://github.com/ramimbo/mergework/issues/1027",
      "signals": ["bounty", "MRWK/MergeWork", "amount"],
      "effort_signals": ["docs-or-tests"],
      "decision_notes": ["parsed payout amount: $450", "payment rail signal present"]
    }
  ]
}
```

## Option 1: Local Demo API

The bundled prototype reads `feed/latest.json` from this repo and exposes a free preview plus a 402-style paid route.

```bash
git clone https://github.com/go165/bounty-radar.git
cd bounty-radar
node examples/paid-alert-api/server.mjs
```

In another terminal:

```bash
curl 'http://localhost:8787/v1/alerts?min_score=50&limit=5'
curl -i 'http://localhost:8787/v1/paid/alerts?min_score=50'
curl -H 'X-Payment: demo-paid' 'http://localhost:8787/v1/paid/alerts?min_score=50'
```

This mode is for local development only. `X-Payment: demo-paid` is not a production payment mechanism.

## Option 2: x402 Paid API Starter

Use `x402-paid-api-starter` when you want the same feed behind a reusable HTTP 402 API shape with preview, paid route, `.well-known/x402`, Cloudflare Worker, and Express x402 examples.

```bash
git clone https://github.com/go165/x402-paid-api-starter.git
cd x402-paid-api-starter
cp .env.example .env
DATA_FEED_URL=https://go165.github.io/bounty-radar/feed/latest.json npm start
```

Smoke test the paid flow:

```bash
SMOKE_QUERY='min_score=50&tag=mergework' npm run smoke:buyer -- http://localhost:8787
```

Useful filters:

```bash
curl 'http://localhost:8787/v1/preview?tag=mergework'
curl -H 'X-Payment: demo-paid' 'http://localhost:8787/v1/paid/data?min_score=50&repo=ramimbo/mergework'
curl -H 'X-Payment: demo-paid' 'http://localhost:8787/v1/paid/data?tag=x402'
```

Feed consumers can also filter on `opportunity_class` and `effort_score` before
serving alerts, for example to expose only low-effort `quick-win` rows to coding
agents.

## Option 3: Cloudflare Worker

For an edge-hosted demo, use the Worker example from `x402-paid-api-starter` and set the feed URL as an environment variable.

```bash
cd x402-paid-api-starter/examples/cloudflare-worker
cp wrangler.toml.example wrangler.toml
```

Set these vars in `wrangler.toml` or with Wrangler secrets/vars:

```toml
DATA_FEED_URL = "https://go165.github.io/bounty-radar/feed/latest.json"
PAY_TO = "0xYourReceiverAddress"
NETWORK = "eip155:84532"
PRICE_USD = "0.001"
```

Then deploy:

```bash
npx wrangler deploy
```

## Option 4: Express x402 Production Path

For real x402 verification, use the Express example from `x402-paid-api-starter` and replace demo payment behavior with official middleware and a facilitator.

```bash
cd x402-paid-api-starter/examples/express-x402
cp .env.example .env
npm install
npm start
```

Minimum production variables:

```text
FACILITATOR_URL=https://your-facilitator.example
EVM_ADDRESS=0xYourReceiverAddress
NETWORK=eip155:84532
PRICE_USD=0.001
```

Use Base Sepolia first. Move to Base mainnet only after end-to-end settlement succeeds with the target facilitator and receiver address.

## Launch Checklist

- Keep the free preview route so buyers can inspect value before payment.
- Make the score heuristic transparent; never claim a bounty is guaranteed.
- Use real x402 verification before charging users or agents.
- Do not store private keys, payment payload secrets, or buyer wallet secrets in logs.
- Publish only in relevant x402, Base, agent, and open-source bounty communities where tool sharing is welcome.
- Do not buy stars, trade stars, use fake accounts, mass-DM developers, or post unrelated comments.

## Suggested Product Positioning

Short description:

> Bounty Radar turns public GitHub bounty issues into a scored JSON feed. Pair it with x402-paid-api-starter to sell filtered bounty alerts to coding agents or dashboards over HTTP 402.

Technical angle:

> The stack is static-first: GitHub Pages hosts the UI and feed, GitHub Actions refreshes data, and a small paid API layer can expose the feed through preview and paid routes.
