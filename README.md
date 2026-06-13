# Bounty Radar

**Find GitHub issues with real payout signals before you spend hours on the wrong bounty.**

Bounty Radar is a zero-backend dashboard for developers and agent builders who hunt paid open-source work. It searches GitHub issues, scores payout credibility signals, highlights Base/USDC/x402/MergeWork keywords, extracts payout addresses, and exports a shortlist you can review before opening a PR.

Live demo: https://go165.github.io/bounty-radar/

![Bounty Radar screenshot](docs/screenshot.png)

## Why This Exists

GitHub has many issues labeled `bounty`, `reward`, or `paid`, but the quality varies. Developers need to answer a few questions quickly:

- Is there an actual payment path, or only vague marketing copy?
- Does the issue mention USDC, Base, x402, MRWK, MergeWork, Gitcoin, TipLink, or another payout rail?
- Is there a visible payout address or claim process?
- Can I export a small list and inspect it before investing time?

Bounty Radar makes that triage fast without asking for your GitHub token by default.

## Features

- **Preset searches** for high-signal bounty issues, Base/USDC work, x402 paid APIs, and MergeWork/MRWK opportunities.
- **Custom GitHub issue search** with optional minimum payout keyword filtering.
- **Payout signal score** based on title/body labels, payment rail terms, reward amounts, and address hints.
- **Best-effort repository quality signals** for stars, forks, recent push activity, and archived status.
- **Saved watchlists** in local storage for repeated bounty scans.
- **Address extraction** for EVM `0x...`, Stellar `G...`, and MRWK `mrwk1...`-style addresses.
- **CSV export** for shortlists.
- **No backend**: runs as static HTML/CSS/JS on GitHub Pages.
- **Optional GitHub token** stored only in browser session storage for higher API rate limits.

## Quick Start

Open the hosted demo, or run locally:

```bash
git clone https://github.com/go165/bounty-radar.git
cd bounty-radar
python3 -m http.server 8080
```

Then open http://localhost:8080.

## Usage

1. Pick a preset such as `Base / USDC` or `x402 paid APIs`.
2. Add optional keywords like `good first issue`, `bug`, `docs`, or a specific ecosystem.
3. Click **Scan GitHub**.
4. Sort by payout score and inspect the top results.
5. Export CSV before deciding what to work on.

## Scoring Model

The score is intentionally simple and visible:

| Signal | Weight |
| --- | ---: |
| Payout keywords (`bounty`, `reward`, `paid`, `prize`) | +12 |
| Crypto rails (`USDC`, `Base`, `x402`, `MRWK`, `MergeWork`) | +18 |
| Amount-like text (`$250`, `100 USDC`, `500 MRWK`) | +16 |
| Payout address present | +20 |
| Issue labels include bounty/reward/help wanted | +8 |
| Repository quality: stars, forks, recent push activity | +3 to +15 |
| Stale issue penalty | -8 |

This is triage, not financial advice. Always inspect the issue, sponsor, repository history, and payout terms yourself.

Repository quality metadata is fetched sequentially and capped to avoid burning unauthenticated GitHub API limits. Add a token for higher limits when scanning large result sets.

## Opportunity Assessment

- **TAM / audience**: independent developers, agent builders, open-source maintainers, and onchain bounty operators who need faster paid-work discovery.
- **Differentiation**: GitHub-native bounty triage focused on payout credibility, not another generic issue search or closed marketplace.
- **Star-worthy hook**: a static, inspectable tool that developers can bookmark, run locally, and extend with their own bounty rails.
- **Monetization path**: hosted alerts, JSON feeds, webhooks, and x402-paid API access for teams and autonomous coding agents.
- **7-day demo feasibility**: the browser demo is already live; the next compounding features are daily digests, validators, and shareable feeds.

## 7-Day Roadmap

- Day 1: Static dashboard, presets, scoring, CSV export. Shipped.
- Day 2: Add saved watchlists in local storage. Shipped.
- Day 3: Add GitHub repo reputation panel: stars, forks, and activity signals. Shipped.
- Day 4: Add payout rail validators for Base, Stellar, MRWK, and TipLink.
- Day 5: Add GitHub Actions daily digest mode.
- Day 6: Add hosted JSON feed for starred watchlists.
- Day 7: Ship API/webhook plan for paid alerts.

## Monetization Path

- Free static dashboard for discovery.
- Paid hosted alerts for teams and agents.
- API endpoint for `new high-signal bounty` feeds.
- Sponsored but clearly labeled bounty listings.
- Optional x402-paid export endpoints for machine agents.

## Legal and Ethical Publishing Checklist

- Do not buy stars, trade stars, use fake accounts, spam comments, or mass-DM developers.
- Publish only in relevant communities: Show HN, x402/Base developer channels, GitHub bounty communities, and project Discords where tool sharing is allowed.
- Be transparent that the scoring is heuristic and requires manual verification.
- Do not claim a bounty is guaranteed unless the linked issue states payout terms clearly.

## Contributing

Contributions are welcome when they improve real payout discovery or make the scoring model easier to inspect. Start with [CONTRIBUTING.md](CONTRIBUTING.md) and include public evidence for new payout rails, presets, or scoring signals.

## Suggested Launch Posts

Short version:

> I built Bounty Radar, a static GitHub Pages tool that searches GitHub bounty issues and scores payout signals like USDC/Base/x402/MRWK keywords, amount text, and payout addresses. No backend, optional GitHub token only in session storage. Feedback welcome: https://go165.github.io/bounty-radar/

Long version:

> Developers waste time on vague bounty issues. Bounty Radar helps shortlist GitHub issues with clearer payout signals, export CSV, and inspect address/payment hints before starting work. It is open source and runs entirely in the browser.

## License

MIT
