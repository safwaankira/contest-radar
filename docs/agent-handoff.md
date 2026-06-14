# Agent Handoff

Bounty Radar exposes a static feed that coding agents and automation scripts can
consume without scraping the browser UI.

## Endpoints

| Endpoint | Purpose |
| --- | --- |
| `https://go165.github.io/bounty-radar/feed/manifest.json` | Feed metadata, refresh cadence, intended consumers, and limitations. |
| `https://go165.github.io/bounty-radar/feed/latest.json` | Daily scored issue shortlist. |
| `https://go165.github.io/bounty-radar/feed/latest.csv` | Spreadsheet-friendly export of the same shortlist. |
| `https://go165.github.io/bounty-radar/feed/schema.json` | JSON Schema for feed validation. |

## Minimal Consumer

```js
const feedUrl = 'https://go165.github.io/bounty-radar/feed/latest.json';
const response = await fetch(feedUrl, { headers: { accept: 'application/json' } });
const feed = await response.json();

const shortlist = feed.items
  .filter((item) => item.score >= 50)
  .filter((item) => item.signals.some((signal) => /bounty|amount|USDC|MRWK|x402/i.test(signal)))
  .slice(0, 10);

console.table(shortlist.map((item) => ({
  score: item.score,
  repo: item.repo,
  title: item.title,
  url: item.url,
})));
```

## Paid API Adapter

Use `x402-paid-api-starter` when the feed should become a paid API surface:

```bash
DATA_FEED_URL=https://go165.github.io/bounty-radar/feed/latest.json npm start
curl 'http://localhost:8787/v1/preview?tag=mergework'
curl -H 'X-Payment: demo-paid' 'http://localhost:8787/v1/paid/data?min_score=50'
```

The adapter normalizes `score`, `preset`, `repo`, `signals`, `labels`,
`addresses`, and `url` into rows that can be filtered by agents.

## Review Rules

- Treat scores as triage hints, not proof that payment is guaranteed.
- Inspect the linked issue, maintainer history, acceptance criteria, and payout
  rules before opening a PR.
- Prefer issues with explicit amount, payout rail, maintainer confirmation, and
  recent project activity.
- Avoid automated comments or mass outreach. Use the feed to pick work, not to
  spam project maintainers.
