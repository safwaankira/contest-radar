# Launch Plan

## Target Users

- Developers looking for paid open-source issues.
- Agent builders who need a shortlist of high-signal bounty tasks.
- Bounty platform operators who want to inspect payment clarity on GitHub issues.
- x402/Base/USDC/MRWK builders who want discovery tooling around paid work.

## Opportunity Score

- **TAM / audience**: high enough for a developer tool because paid OSS work, onchain bounties, and coding agents all need reliable task discovery.
- **Differentiation**: narrow payout-signal triage across GitHub issues, instead of another marketplace that requires project owners to list work manually.
- **Propagation hook**: developers can share a search preset, CSV shortlist, hosted JSON feed, shortlist CLI command, or manifest/schema pair when discussing bounty quality.
- **Monetization path**: hosted alerts, webhooks, public feeds, and x402-paid machine-readable bounty intelligence.
- **7-day demo fit**: static UI is live now; daily digest and feed endpoints can ship without changing the public demo surface.

## Differentiation

- Runs as a static GitHub Pages app with no backend or account.
- Focuses on payout signals, not generic issue search.
- Extracts payout address shapes and payment rail terms from issue text.
- Exports reviewable CSV shortlists for manual due diligence.

## 7-Day Demo Scope

- Day 1: Static search, scoring, address extraction, CSV export. Shipped.
- Day 2: Saved watchlists in local storage. Shipped.
- Day 3: Repo reputation panel using GitHub repository metadata. Shipped.
- Day 4: Shareable preset URLs for launch posts and community review. Shipped.
- Day 5: GitHub Actions daily digest mode. Shipped.
- Day 6: Public JSON/CSV feed for agents and dashboards. Shipped.
- Day 6.5: Feed manifest, JSON Schema, and agent handoff guide. Shipped.
- Day 7: x402-paid alert API prototype. Shipped as `examples/paid-alert-api`.

## Legal Publishing Checklist

- No bought stars, star swaps, fake accounts, spam comments, bulk DMs, or misleading claims.
- Share only in relevant communities where tool launches are allowed.
- Use transparent language: the score is heuristic, not proof of payment.
- Link to source, demo, and known limitations.
- Ask for feedback, not stars.

## Relevant Launch Channels

- Show HN: project launch post focused on developer utility.
- Product Hunt: only after saved watchlists and repo metadata land.
- Base / x402 developer Discord channels where project showcases are permitted.
- Reddit communities only when rules allow open-source tooling posts.
- Awesome lists for GitHub tooling, x402 resources, or open-source funding tools after the demo stabilizes.

## Progress

- Repository: https://github.com/go165/bounty-radar
- Demo: https://go165.github.io/bounty-radar/
- Current shipped hooks: payout scoring, address classification, CSV export, saved watchlists, shareable URLs, capped best-effort repository quality signals, daily JSON/CSV feed, zero-dependency shortlist CLI, 402-style paid alert API prototype.
- Agent handoff: https://github.com/go165/bounty-radar/blob/main/docs/agent-handoff.md
- Feed: https://go165.github.io/bounty-radar/feed/latest.json
- Stars: track manually from GitHub repository page.
