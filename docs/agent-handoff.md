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
| `https://go165.github.io/bounty-radar/.well-known/agent.json` | Agent discovery document with feed, schema, CLI, and paid API integration pointers. |
| `https://go165.github.io/bounty-radar/llms.txt` | Compact LLM-readable project context and integration guide. |

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

## Shortlist CLI

Use the zero-dependency CLI when an agent, cron job, or CI workflow needs a
small filtered list without embedding feed parsing code:

```bash
npm run shortlist -- --min-score 50 --require-amount --require-rail --limit 10
npm run shortlist -- --preset mergework --format json
npm run shortlist -- --feed feed/latest.json --signal 'x402|USDC|MRWK' --format csv
```

Useful filters:

| Option | Purpose |
| --- | --- |
| `--min-score 60` | Ignore weak payout-signal matches. |
| `--preset x402` | Focus on one feed preset. |
| `--repo owner/name` | Inspect one repository from the feed. |
| `--signal 'USDC|MRWK'` | Require a matching signal label. |
| `--require-amount` | Require explicit amount text. |
| `--require-rail` | Require a USDC/Base/x402/MRWK rail signal. |
| `--format markdown` | Emit Markdown, JSON, or CSV for handoff. |

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
