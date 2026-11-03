// Read-only health check: balances, tag decoding of the latest tagged txs. Spends nothing.
//   node --env-file=.env scripts/check.js [txHash...]
import { erc20Abi, formatUnits } from "viem";
import { verifyTx } from "@celo/attribution-tags";
import { TOKENS } from "../lib/config.js";
import { agent } from "../lib/chain.js";

const { publicClient, account } = agent();
const out = { agent: account.address };
for (const [sym, t] of Object.entries(TOKENS)) {
  const b = await publicClient.readContract({ address: t.address, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  out[sym] = formatUnits(b, t.decimals);
}
out.nonce = await publicClient.getTransactionCount({ address: account.address });
for (const h of process.argv.slice(2)) out[h] = await verifyTx({ client: publicClient, hash: h });
console.log(JSON.stringify(out, null, 2));
