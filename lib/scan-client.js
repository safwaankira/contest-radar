// Client for Contest Radar's paid scan, for other agents (MCP tool) and the CLI.
// Pays with the CALLER's own Celo wallet. The payee is pinned to the Contest Radar agent and the amount is
// capped, so a tampered 402 response can't redirect or inflate the payment. The key never leaves this process.
import { createPublicClient, http, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { TOKENS, SCAN_PRICE, SITE_URL } from "./config.js";

export const CONTEST_RADAR_AGENT = "0x6859Abd01F1686E9DDfE809CC69Fab1054447457";
const NETWORK = "eip155:42220";
const ORDER = ["USDT", "USDC", "USAT"];

export async function paidScan({ keywords, privateKey, maxAtomic = SCAN_PRICE, endpoint = `${SITE_URL}/api/scan`, rpc = "https://forno.celo.org" }) {
  if (!privateKey) throw new Error("set CONTEST_RADAR_PAYER_KEY to a Celo wallet holding a few cents of USDT, USDC or USAT");
  if (typeof keywords !== "string" || keywords.trim().length < 3) throw new Error("keywords: at least 3 characters");
  const account = privateKeyToAccount(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`);
  const publicClient = createPublicClient({ chain: celo, transport: http(rpc) });
  const bal = {};
  for (const [sym, token] of Object.entries(TOKENS)) {
    const address = token.address ?? token;
    bal[sym] = { address, atomic: await publicClient.readContract({ address, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }) };
  }
  const signer = toClientEvmSigner(account, publicClient);
  const client = x402Client.fromConfig({
    schemes: [{ network: NETWORK, client: new ExactEvmScheme(signer) }],
    spendControls: { maxAmountPerPayment: false, allowedAssets: Object.values(bal).map((b) => ({ network: NETWORK, asset: b.address, maxAmountPerPayment: maxAtomic.toString() })) },
    paymentRequirementsSelector: (_v, reqs) => {
      for (const sym of ORDER) {
        const r = reqs.find((q) => q.network === NETWORK && q.asset.toLowerCase() === bal[sym].address.toLowerCase() && q.payTo.toLowerCase() === CONTEST_RADAR_AGENT.toLowerCase());
        if (r && BigInt(r.amount) <= maxAtomic && bal[sym].atomic >= BigInt(r.amount)) return r;
      }
      throw new Error(`wallet ${account.address} needs $${Number(maxAtomic) / 1e6} in USDT, USDC or USAT on Celo`);
    },
  });
  const pay = wrapFetchWithPayment(fetch, client);
  const res = await pay(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ keywords: keywords.trim() }),
    signal: AbortSignal.timeout(130_000),
  });
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}
