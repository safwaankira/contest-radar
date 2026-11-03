// Daily run on the agent host:
//   1. build the feed (GitHub + poidh free; X, Reddit and the model paid through buy on Celo)
//   2. append this run's paid-call receipts to feed/ledger.json
//   3. anchor the feed's hash onchain from the agent wallet (tagged, gas paid in USDC)
//
//   npm run daily                     real run on Celo mainnet
//   BUY_SANDBOX=1 npm run daily       test run with Celo Sepolia test USDC, no anchor
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { keccak256, toHex } from "viem";

const feedPath = (name) => new URL(`../feed/${name}`, import.meta.url);
const readJson = (name, dflt) => (existsSync(feedPath(name)) ? JSON.parse(readFileSync(feedPath(name), "utf8")) : dflt);
const writeJson = (name, v) => writeFileSync(feedPath(name), JSON.stringify(v, null, 2) + "\n");

process.chdir(new URL("..", import.meta.url).pathname);
await import("./build-feed.mjs");

const feed = readJson("latest.json", null);
const run = readJson("run.json", null);
if (!feed) throw new Error("feed was not written");

if (process.env.BUY_SANDBOX === "1") {
  console.log("sandbox run: not anchoring.", JSON.stringify(feed.run));
  process.exit(0);
}

if (run) {
  const ledger = readJson("ledger.json", { agent: feed.run?.agent, runs: [] });
  ledger.runs.unshift({ at: run.at, kind: "daily", spent_usd: run.spent_usd, receipts: run.receipts });
  ledger.runs = ledger.runs.slice(0, 200);
  writeJson("ledger.json", ledger);
}

// Anchor: a zero-value self-transaction whose calldata is the feed's hash, plus our ERC-8021 tag.
const { agent, sendTagged } = await import("../lib/chain.js");
const fresh = Date.now() - Date.parse(feed.generated_at) < 15 * 60_000;
try {
  if (!fresh) throw new Error(`feed is stale (${feed.generated_at}); not anchoring an old feed`);
  const digest = keccak256(toHex(readFileSync(feedPath("latest.json"), "utf8")));
  const { hash } = await sendTagged({ to: agent().account.address, data: digest });
  const anchors = readJson("anchors.json", { anchors: [] });
  anchors.anchors.unshift({ at: feed.generated_at, feed_hash: digest, tx: hash });
  anchors.anchors = anchors.anchors.slice(0, 365);
  writeJson("anchors.json", anchors);
  console.log("anchored", hash);
} catch (e) {
  console.error("anchor failed:", e.message);
}
console.log(`feed: ${feed.count} items, contests spent $${feed.run?.spent_usd ?? 0}`, feed.errors?.map((e) => e.message));
