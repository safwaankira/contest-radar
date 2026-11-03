# Contest Radar: proof of payment

Generated 2026-11-03 20:10 UTC from the chain (Blockscout) and the agent's ledger. Live version: https://contest-radar-celo.vercel.app/feed/proof.md

- **Agent wallet (x402 PayTo for scans):** [`0x6859abd01f1686e9ddfe809cc69fab1054447457`](https://celo.blockscout.com/address/0x6859abd01f1686e9ddfe809cc69fab1054447457)
- **ERC-8004:** agentId 10034, registration [0x62b225b1…](https://celo.blockscout.com/tx/0x62b225b16d2e7bce4a2b4dfb8d7c59e2f9c8a5e00d23dfe30bc848f1f16d19b7)
- **Attribution tag:** `celo_683ee8609385` on every transaction the agent sends (anchors, registration, scan settlements, refunds). Gas is paid by the agent in USDC through fee abstraction; no relayer.
- **Payments to buy and Agent402** are x402 EIP-3009 authorisations signed by the agent wallet and submitted by the seller's facilitator, so they show as transfers from the agent to the payee.

## Paid calls to services we don't control

| Service | Payee | Paid calls | Spent | Days with calls |
|---|---|---:|---:|---:|
| buy gateway (TikHub X / Reddit search) | [`0x20fa…333b`](https://celo.blockscout.com/address/0x20faaca5f980e29639a0fcc6dca6988e18ed333b) | 27 | $0.140 | 1 |
| Agent402 metered chat (gpt-4o-mini) | [`0xabf4…a9d0`](https://celo.blockscout.com/address/0xabf4fabd7c416fb67202e5f9002389fc75e2a9d0) | 8 | $0.034 | 1 |

The first calls on 3 Nov were build and test runs while wiring up buy (including one charged-then-failed Cencori call, reported to buy in the README). Since then the agent makes one scheduled daily run (2 X searches, 1 Reddit search, 1 model read, about $0.02) plus whatever personal scans people buy. We don't make calls to pad the count.

## Scan sales (x402, POST /api/scan)

1 paid scan(s) from 1 wallet(s); **0 independent user(s)** by the hackathon's definition (not ours, not funded by us, active on Celo before 6 Oct).

| When | Payer | Amount | Settlement | Independent? |
|---|---|---:|---|---|
| 2026-11-03 18:10 UTC | [`0xd9aa…7293`](https://celo.blockscout.com/address/0xd9aaa6234ac620cde2fe5c6a2ffd5a8cc86e7293) | $0.05 USDC | [0x1c33cb15…](https://celo.blockscout.com/tx/0x1c33cb15e5c300008c75f536e0e7d3975ab9c37221ad904ed97d2d7b2c0a563e) | no: our own test wallet |

## Every paid call

| When | Service | Route | Amount | Tx |
|---|---|---|---:|---|
| 2026-11-03 16:27 UTC | buy gateway | `/v1/social/reddit/posts/search` (daily) | $0.0050 | [0xef67c7b5…](https://celo.blockscout.com/tx/0xef67c7b56945f7ca368dd0a31679bc39e857841b0aa2141c5dceb150c890bf30) |
| 2026-11-03 16:27 UTC | buy gateway | `/v1/social/x/posts/search` (daily) | $0.0050 | [0x1d22f5a8…](https://celo.blockscout.com/tx/0x1d22f5a854df45e04ed00bdcfc2088ea70aa2405cfb881058d4a798b66313dfd) |
| 2026-11-03 16:27 UTC | buy gateway | `/v1/social/x/posts/search` (daily) | $0.0050 | [0x774e9d91…](https://celo.blockscout.com/tx/0x774e9d917b633360bf0b83683c74d8d4cb06a15e7236e07276b269ce496058df) |
| 2026-11-03 16:27 UTC | buy gateway | `/cencori/v1/chat/completions` (daily) | $0.0100 | [0xe3525a10…](https://celo.blockscout.com/tx/0xe3525a10d78a865c458ba2e984a6be4b3fe6aef485ec757d48fe0594dddcedad) |
| 2026-11-03 17:36 UTC | buy gateway | `/v1/social/reddit/posts/search` (daily) | $0.0050 | [0x487a2cf1…](https://celo.blockscout.com/tx/0x487a2cf11b237c48f855ae1b2145160a75b4e861aabf09428d0d058b18694509) |
| 2026-11-03 17:36 UTC | buy gateway | `/v1/social/x/posts/search` (daily) | $0.0050 | [0x92c43caf…](https://celo.blockscout.com/tx/0x92c43caffbaea65c82f032e9d2b6abbe388d1a10425db1e3483349aff5a9e996) |
| 2026-11-03 17:36 UTC | buy gateway | `/v1/social/x/posts/search` (daily) | $0.0050 | [0x986b690e…](https://celo.blockscout.com/tx/0x986b690e396d1204b0e92faae37215628d40e838183d567b38b6bc798917ace3) |
| 2026-11-03 17:37 UTC | Agent402 metered chat | `/v1/metered/chat/completions` (daily) | $0.0049 | [0x94cf9017…](https://celo.blockscout.com/tx/0x94cf90170b7eb82b6bf89b70a6fe33a226ed2710663087b003735d4347942777) |
| 2026-11-03 18:00 UTC | buy gateway | `/v1/social/reddit/posts/search` (daily) | $0.0050 | [0x17741bda…](https://celo.blockscout.com/tx/0x17741bda566de3945c3c78dc404d1063436f6e6d895615d464bfdb3a53d63fc8) |
| 2026-11-03 18:00 UTC | buy gateway | `/v1/social/x/posts/search` (daily) | $0.0050 | [0x6f0a9e2b…](https://celo.blockscout.com/tx/0x6f0a9e2ba38d1d06295e7ea317761c3a4f0d8b01646deda04b6142ea7268058b) |
| 2026-11-03 18:00 UTC | buy gateway | `/v1/social/x/posts/search` (daily) | $0.0050 | [0x16a1cde3…](https://celo.blockscout.com/tx/0x16a1cde30e8bee25aa1efdb92689e47352b5c7016ab81602fca8c96fb7ec155e) |
| 2026-11-03 18:00 UTC | Agent402 metered chat | `/v1/metered/chat/completions` (daily) | $0.0040 | [0x86a44a27…](https://celo.blockscout.com/tx/0x86a44a2797a53d7063b03c23fbe1f3a5ac17ec0487cbede05ed307e2937dd7e7) |
| 2026-11-03 18:06 UTC | buy gateway | `/v1/social/reddit/posts/search` (daily) | $0.0050 | [0x4503ca28…](https://celo.blockscout.com/tx/0x4503ca28f9fb180b9a0b2b3fc53dbe9e6e39e38f024382b8ffbfb227e9c07c6f) |
| 2026-11-03 18:06 UTC | buy gateway | `/v1/social/x/posts/search` (daily) | $0.0050 | [0xfa154b47…](https://celo.blockscout.com/tx/0xfa154b476d50f760f9191c02bd2cabff8fab8031a909c9fdab8c2d5d2515e75f) |
| 2026-11-03 18:06 UTC | buy gateway | `/v1/social/x/posts/search` (daily) | $0.0050 | [0x6623dfba…](https://celo.blockscout.com/tx/0x6623dfba812cd940d688577ef0335317da0dc7e9a65921eba3a16f5415c28bb9) |
| 2026-11-03 18:06 UTC | Agent402 metered chat | `/v1/metered/chat/completions` (daily) | $0.0041 | [0x98e3b7f0…](https://celo.blockscout.com/tx/0x98e3b7f0ff1b08222b5634510ba3b4af1ba3a6bd2f0022463e4038c3d86b0b78) |
| 2026-11-03 18:10 UTC | buy gateway | personal scan or pre-ledger run | $0.0050 | [0x264faaf5…](https://celo.blockscout.com/tx/0x264faaf531d01cd3f8b6885798c952ba5ea3d0ee0fbad71ae32c7895186ae0e2) |
| 2026-11-03 18:10 UTC | buy gateway | personal scan or pre-ledger run | $0.0050 | [0x20dba3bc…](https://celo.blockscout.com/tx/0x20dba3bc8d3180592c3c4b98b66038bef664d326fad99ed64a5554e3de3d574c) |
| 2026-11-03 18:10 UTC | Agent402 metered chat | personal scan or pre-ledger run | $0.0039 | [0x43f2220c…](https://celo.blockscout.com/tx/0x43f2220c78855294164b507e185ae9f6d257ebe73f1989f52717a8533e242974) |
| 2026-11-03 18:41 UTC | buy gateway | `/v1/social/reddit/posts/search` (daily) | $0.0050 | [0xf8f4e31d…](https://celo.blockscout.com/tx/0xf8f4e31d82331d7b270892daad3fab5b2763c275fd4774e6eb3749e568e01e38) |
| 2026-11-03 18:41 UTC | buy gateway | `/v1/social/x/posts/search` (daily) | $0.0050 | [0x62193283…](https://celo.blockscout.com/tx/0x62193283b648230e6046aef162feb0e981e99e56abe017fa4f40705eb87d87ce) |
| 2026-11-03 18:41 UTC | buy gateway | `/v1/social/x/posts/search` (daily) | $0.0050 | [0x8727fa6d…](https://celo.blockscout.com/tx/0x8727fa6dfb923487943bfebe5f648dd7571d25eb1066a5a5d4612a1b6f185b54) |
| 2026-11-03 18:42 UTC | Agent402 metered chat | `/v1/metered/chat/completions` (daily) | $0.0042 | [0x2cd9731b…](https://celo.blockscout.com/tx/0x2cd9731b716dc99a3fcfd8a1ecfdb0c103710ee7f7811920034922f61e0caacc) |
| 2026-11-03 18:45 UTC | buy gateway | `/v1/social/reddit/posts/search` (daily) | $0.0050 | [0x385bc432…](https://celo.blockscout.com/tx/0x385bc43263819364a4a60b9e18fe8c3aa7e472f6db0ffbd2738971f6cb06cd76) |
| 2026-11-03 18:45 UTC | buy gateway | `/v1/social/x/posts/search` (daily) | $0.0050 | [0xdd630159…](https://celo.blockscout.com/tx/0xdd6301593962e2377e080e372d6bfe8a901d20a7860efaa281ba080802b31458) |
| 2026-11-03 18:45 UTC | buy gateway | `/v1/social/x/posts/search` (daily) | $0.0050 | [0x820d94fd…](https://celo.blockscout.com/tx/0x820d94fd7c6c6e3fdb7d92733546502742c04e05b0f419495244c455ccc6a4e4) |
| 2026-11-03 18:45 UTC | Agent402 metered chat | `/v1/metered/chat/completions` (daily) | $0.0042 | [0x038de9dc…](https://celo.blockscout.com/tx/0x038de9dcb709ac19fb75cfcbba0a753a2152826ef9d788ee9f7b1da4cb7bb4ef) |
| 2026-11-03 18:48 UTC | buy gateway | `/v1/social/reddit/posts/search` (daily) | $0.0050 | [0x70087ba8…](https://celo.blockscout.com/tx/0x70087ba8a057a2184d62d38e81c0e0c3b82301dfaa82013f2904ceb360b6e684) |
| 2026-11-03 18:48 UTC | buy gateway | `/v1/social/x/posts/search` (daily) | $0.0050 | [0x7451795b…](https://celo.blockscout.com/tx/0x7451795b46fdb0fbb50c48ecc03490d15f98eac6a8d53fa8712552c206e47ef5) |
| 2026-11-03 18:48 UTC | buy gateway | `/v1/social/x/posts/search` (daily) | $0.0050 | [0x6308c032…](https://celo.blockscout.com/tx/0x6308c03261768e1c880a818c58e1bdd91e6551651ad04a51222bc54570539326) |
| 2026-11-03 18:48 UTC | Agent402 metered chat | `/v1/metered/chat/completions` (daily) | $0.0042 | [0xa2016e8e…](https://celo.blockscout.com/tx/0xa2016e8ee4a811acb24c6ad1b5d76d0baeceafdd5dc4715d9e008333060269f9) |
| 2026-11-03 18:53 UTC | buy gateway | `/v1/social/reddit/posts/search` (daily) | $0.0050 | [0x011300ce…](https://celo.blockscout.com/tx/0x011300ce3dd021a238078f2d94b6f11ecee022d08b38dfe956e3315247d60d99) |
| 2026-11-03 18:53 UTC | buy gateway | `/v1/social/x/posts/search` (daily) | $0.0050 | [0x359288a1…](https://celo.blockscout.com/tx/0x359288a1f6812b207b3c0d53cc612819a75981f27225a1ae44a5cfdf00194a5f) |
| 2026-11-03 18:53 UTC | buy gateway | `/v1/social/x/posts/search` (daily) | $0.0050 | [0xd63dab03…](https://celo.blockscout.com/tx/0xd63dab03db9aa390a08feb307bc8089bea07724249f9a5f7fa0f3af75bbd143d) |
| 2026-11-03 18:53 UTC | Agent402 metered chat | `/v1/metered/chat/completions` (daily) | $0.0041 | [0x7c2306fd…](https://celo.blockscout.com/tx/0x7c2306fd4ddb687f6640424674270a9b285511deb24adf54caa48ce892aadf1b) |

## Daily onchain anchors

keccak256 of that day's `feed/latest.json`, written as calldata of a tagged zero-value self-transaction.

- 2026-11-03 18:53 UTC: [0x5b6e5045…](https://celo.blockscout.com/tx/0x5b6e5045628f782520447628c8c234c05cd480bc8799ca1f6bc92b9f6253e4d4) (`0x2bf230236fe81fc6…`)
- 2026-11-03 18:48 UTC: [0xeaa04eb0…](https://celo.blockscout.com/tx/0xeaa04eb085a07272e174fc2ee96d597765b652457930e8bd68a39304c6c7566e) (`0xb95472bf4000ba24…`)
- 2026-11-03 18:45 UTC: [0x563d0ec0…](https://celo.blockscout.com/tx/0x563d0ec080dc713427a168c5865deab27d0b6b79efa363fdc2c3051cede42797) (`0xe7b2dcf92523577e…`)
- 2026-11-03 18:42 UTC: [0xa11dd7d9…](https://celo.blockscout.com/tx/0xa11dd7d919f6e79aef538bea519f828480ea9cca6bd5c9771d630078bff8b607) (`0xe28fcf60610b77a4…`)
- 2026-11-03 18:06 UTC: [0xa77e8ffc…](https://celo.blockscout.com/tx/0xa77e8ffc5ff006c4ab964f39f908fa4cbdd2c59b494720ffa2a92d153e154e64) (`0xc0b862668bee41e4…`)
- 2026-11-03 18:00 UTC: [0xb6b8a8f9…](https://celo.blockscout.com/tx/0xb6b8a8f9045f56bb7cb4ec6aa1f14b738b75439b4feea62d21e5f01f175e6713) (`0x59ea60a1aff29ffe…`)
- 2026-11-03 17:37 UTC: [0xe391f993…](https://celo.blockscout.com/tx/0xe391f993e2d763ea04b91d347b88ae75b6be746308321310ad545200a8fe1fde) (`0xd89556fd3e2501da…`)
- 2026-11-03 16:27 UTC: [0x28474538…](https://celo.blockscout.com/tx/0x28474538b405e62f5bcfc16a47744d915942b7e698de35fd3a15b6d6a93ba2be) (`0xdd37f244beecb971…`)
