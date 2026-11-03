// Sandbox smoke test of the rules reader: one 1-minute buy browser session on Celo Sepolia (test USDC),
// read each URL, print what came back. No mainnet payment, no model call.
//   BUY_SANDBOX=1 node scripts/rules-smoke.mjs https://lu.ma/... https://example.com/rules
import { createBuySession } from "../lib/buy.js";
import { rulesLinks } from "../lib/rules.js";

if (process.env.BUY_SANDBOX !== "1") throw new Error("sandbox only: set BUY_SANDBOX=1");
const urls = process.argv.slice(2).flatMap((u) => rulesLinks(u));
if (!urls.length) throw new Error("give rules-page URLs (social links and bot-walled hosts are skipped)");
const session = createBuySession({ sandbox: true, label: "rules-smoke" });
const browser = await session.browser(1);
try {
  for (const u of urls) {
    const t0 = Date.now();
    try {
      const text = await browser.read(u);
      console.log(`${u}  ${text.length} chars in ${Date.now() - t0} ms\n  ${text.slice(0, 300).replace(/\s+/g, " ")}\n`);
    } catch (e) {
      console.log(`${u}  failed: ${e.message}`);
    }
  }
} finally {
  await browser.close();
}
console.log("receipts:", session.receipts.map((r) => `${r.route} ${r.status} paid=${r.paid} $${r.amountUsd} ${r.network}`));
