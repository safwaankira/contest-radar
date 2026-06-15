# Claim Before Coding

Use this workflow when you want a short list of paid GitHub issues that are
worth manual review before you claim, comment, or open a pull request.

The goal is to avoid the common time sinks:

- the bounty already has multiple competing PRs,
- the maintainer has already accepted another solution,
- the issue asks for hidden context, wallet secrets, signup gates, or KYC,
- the payout text has an amount but no credible payout signal.

## Local Audit

Run the shortlist first when you only need ranked feed rows:

```bash
npm run shortlist -- --min-score 50 --require-amount --require-rail --limit 10
```

Run the full audit before investing implementation time:

```bash
npm run audit:shortlist -- \
  --feed feed/latest.json \
  --limit 8 \
  --require-rail \
  --min-amount-usd 50 \
  --max-risk-score 25 \
  --max-competition-score 40
```

The audit fetches issue comments and related pull requests, then keeps only
candidates with the `consider` recommendation by default. It is intentionally
conservative: noisy, already-claimed, accepted, merged, or risky issues should
fall out before you spend time coding.

## GitHub Actions Digest

Copy [examples/github-action-claim-before-coding.yml](../examples/github-action-claim-before-coding.yml)
into `.github/workflows/bounty-claim-audit.yml` in a private planning repo or
team operations repo.

It runs on a schedule or manually, clones Bounty Radar, audits the hosted daily
feed, and writes a Markdown table to the workflow summary. It does not comment
on upstream issues, DM maintainers, or claim anything automatically.

## Review Rule

Treat the output as a triage queue, not permission to spam. Open the linked
issue, read the acceptance criteria, inspect repository activity, and only
claim or submit when you can make a real contribution.
