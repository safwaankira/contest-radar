# Contest Radar

Open crypto contests and bounties worth entering, read and ranked every day by an agent that pays for its own data on Celo.

**Live:** https://contest-radar-celo.vercel.app · **Agent wallet:** [`0x6859Abd01F1686E9DDfE809CC69Fab1054447457`](https://celo.blockscout.com/address/0x6859Abd01F1686E9DDfE809CC69Fab1054447457) · **Feed:** [`/feed/latest.json`](https://contest-radar-celo.vercel.app/feed/latest.json) · **Built on** [go165/bounty-radar](https://github.com/go165/bounty-radar) (MIT)

Entry for Celo's *Agents on Open Rails* hackathon, **Build with buy** track.

## Who it is for

People who make money entering crypto contests: thread writers, meme makers, designers, video editors and small dev teams. Today they find contests by scrolling X, Reddit, poidh and GitHub for an hour a day. Most of what they find has already closed, needs a seed phrase, or has 400 entries. Contest Radar does that scrolling for them every morning. It reads each post and returns a short list ranked by prize, time left, effort and how crowded it already is.

## What the agent buys, and why

The agent owns no data and no model. Every input is bought per request from a USDC float on Celo:

| What | From | Price | Why |
|---|---|---|---|
| X post search (×2 per run) | [buy](https://usebuy.ai) gateway → TikHub | $0.005 | contests are announced on X first |
| Reddit post search | buy gateway → TikHub | $0.005 | contests in r/CryptoCurrency-type communities |
| Model reading of ~45 posts | [Agent402](https://agent402.tools) metered chat (listed in buy's catalogue) | ~$0.005 | pull out prize, deadline, effort and what to submit |
| poidh bounties, GitHub issues | public feeds | free | already structured |

A daily run costs about **$0.02**. Each run's receipts, with settlement transaction hashes, are in [`feed/ledger.json`](https://contest-radar-celo.vercel.app/feed/ledger.json) and on the agent's [Blockscout page](https://celo.blockscout.com/address/0x6859Abd01F1686E9DDfE809CC69Fab1054447457). Payments to buy go to `0x20faAca5F980E29639A0FCC6dcA6988E18ed333B` and payments to Agent402 go to `0xaBF4FAbd7c416fB67202E5f9002389Fc75e2a9D0`.

The agent also **earns**. Anyone, whether a person in the web app or another agent, can buy a personal scan for their own keywords: `POST /api/scan` over x402, $0.05 in USDC, USD₮ or USA₮. A scan costs the agent about $0.025 in buy and Agent402 calls, so each one pays for itself and funds about one more daily run.

## How it works

```
                 free                       paid per request on Celo (x402)
   poidh feed ───────────┐        X search ─┐ (buy)
   GitHub issues ────────┤      Reddit ─────┤ (buy)
                         │                  ▼
                         │         prefilter: announcements with a prize
                         │                  ▼
                         │         model reads ~45 posts (Agent402)
                         ▼                  ▼
            bounty-radar scoring: payout terms, rails, amount, risk flags,
            effort, + deadline window + "crowded" competition flag
                         ▼
     feed/latest.json · csv · rss · MCP · web app      keccak(feed) → tagged tx on Celo
```

- **Scoring is plain code, not the model.** The model only reads and extracts. bounty-radar's scorer decides the class (`quick-win`, `high-value`, `rail-watch`, `standard`, `manual-review`, `avoid`), so the same inputs always rank the same way. Scams that ask for keys or seed phrases are scored `avoid` and dropped.
- **Every agent transaction carries the ERC-8021 tag** `celo_683ee8609385` and pays gas in USDC through Celo fee abstraction. The agent holds no CELO.
- **Personal scans settle themselves.** The agent verifies the buyer's EIP-3009 authorization with `@x402/evm`'s facilitator code and submits it from its own wallet, so settlements carry the attribution tag (the hosted facilitator can't tag them yet). The buyer is charged only if ranked results come back.
- **The feed is anchored daily.** A zero-value self-transaction whose calldata is `keccak256(feed/latest.json)` ([`feed/anchors.json`](https://contest-radar-celo.vercel.app/feed/anchors.json)).
- **ERC-8004 identity:** see [`/agent.json`](https://contest-radar-celo.vercel.app/agent.json) and [8004scan](https://8004scan.io).

## What is new here vs. the base

[go165/bounty-radar](https://github.com/go165/bounty-radar) (MIT, June 2026, pinned at `343f0c7`) was a zero-backend GitHub bounty dashboard with a daily feed, CLI, MCP server and an unwired "402-style" paid-API prototype. Everything below was written during the hackathon. The git history separates it from the base commits.

- New sources: poidh (free), X and Reddit (bought through buy), with a deadline parser and a competition ("crowded") flag
- Model reading step bought per call (Agent402), with a hard per-call and per-run budget, and receipts for every payment
- `scripts/scoring.mjs`: the base's scorer extracted unchanged (verified identical on samples) so every source shares it, plus filters for bot roundups, claim threads and implausible amounts
- The paid API made real: x402 v2 on Celo in USDC/USD₮/USA₮, self-settled and tagged (`api/scan.js`, `lib/seller.js`)
- Agent wallet, fee abstraction, attribution tags, daily onchain anchor, ERC-8004 registration (`lib/chain.js`, `scripts/daily.js`, `scripts/register.js`)
- New web app (React + shadcn-style components): radar, paid personal scan from MiniPay or any wallet, and a live ledger of what the agent paid and earned
- Removed: the base's GitHub Actions job that committed the feed daily, its in-browser token prompt, the remote esm.sh import, and its `gh auth token` fallback. GitHub search runs unauthenticated.

## Run it

```bash
npm ci
cp .env.example .env            # AGENT_PRIVATE_KEY: a fresh wallet holding a few dollars of USDC on Celo
npm test                        # 37 tests
BUY_SANDBOX=1 npm run daily     # free test run on Celo Sepolia (buy's sandbox)
npm run daily                   # real run: ~$0.02, writes feed/, anchors onchain
npm run build                   # web app + feeds into web/dist (Vercel)
```

Ask for a personal scan from any x402 client:

```bash
buy curl --max-amount 0.05 -X POST -H 'content-type: application/json' \
  -d '{"keywords":"meme OR design"}' https://contest-radar-celo.vercel.app/api/scan
```

The base's CLI and MCP server work unchanged on the new feed: `npm run shortlist -- --opportunity quick-win`, `node scripts/mcp-server.mjs`.

## Feedback for buy

`/cencori/v1/chat/completions` only accepts `maximo-atlas-1.3`, which Cencori has retired, so every call is charged $0.01 and then fails upstream with a 400 (Nov 3 2026, settlement tx `0xe3525a10d78a865c458ba2e984a6be4b3fe6aef485ec757d48fe0594dddcedad`). Contest Radar keeps Cencori behind `LLM_PROVIDER=cencori` for when the allowlist is updated.

## Limits

Scores are triage signals, not payout guarantees. Read each contest's rules at the source. The agent's float is small on purpose (one bounded hot wallet, ETHSkills' advice). Payments are final.

## License

MIT. Original bounty-radar code © its authors; see [LICENSE](LICENSE).
