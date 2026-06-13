# Paid Alert API Prototype

This example turns the generated Bounty Radar feed into a small alert API with a free preview route and a 402-style paid route. It uses only Node.js built-ins and reads `../../feed/latest.json` by default.

The payment check is intentionally a demo header, not production x402 verification. Replace `isPaymentSatisfied()` with a real x402 facilitator verification step before charging users or agents.

For a reusable paid API starter with `.well-known/x402`, Cloudflare Worker, and official Express x402 examples, see https://github.com/go165/x402-paid-api-starter and the deployment guide in `docs/paid-alert-api.md`.

## Run

```bash
node examples/paid-alert-api/server.mjs
```

## Routes

```bash
curl http://localhost:8787/health
curl 'http://localhost:8787/v1/alerts?min_score=40&limit=5'
curl -i 'http://localhost:8787/v1/paid/alerts?min_score=40'
curl -H 'X-Payment: demo-paid' 'http://localhost:8787/v1/paid/alerts?min_score=40'
```

## Environment

- `PORT`: server port, default `8787`.
- `FEED_PATH`: path to a compatible Bounty Radar JSON feed.
- `PAYMENT_TOKEN`: demo payment header value, default `demo-paid`.
- `BYPASS_PAYMENT=true`: skip payment checks for local integration tests.

## Why This Exists

Bounty Radar should be useful to humans and agents. The static UI helps people inspect opportunities; this example shows how the same feed can become a paid alert surface for coding agents, internal dashboards, or webhook workers.
