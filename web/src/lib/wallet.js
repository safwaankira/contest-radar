import { createPublicClient, createWalletClient, custom, http, erc20Abi, formatUnits } from "viem";
import { celo } from "viem/chains";
import { x402Client } from "@x402/core/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";

export const TOKENS = {
  USDC: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
  USDT: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
  USAT: "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771",
};
const PRICE = 50000n; // $0.05, what the API quotes
const AGENT = "0x6859Abd01F1686E9DDfE809CC69Fab1054447457"; // the only address this page will ever pay
export const publicClient = createPublicClient({ chain: celo, transport: http("https://forno.celo.org") });

export const hasWallet = () => typeof window !== "undefined" && Boolean(window.ethereum);
export const isMiniPay = () => Boolean(window.ethereum?.isMiniPay);

export async function connect() {
  if (!window.ethereum) throw new Error("No wallet found. Open this page in MiniPay, or install a browser wallet.");
  const [address] = await window.ethereum.request({ method: "eth_requestAccounts" });
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xa4ec" }] });
  } catch (e) {
    if (e?.code !== 4902) throw new Error("Please switch your wallet to Celo and try again.");
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{ chainId: "0xa4ec", chainName: "Celo", nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 }, rpcUrls: ["https://forno.celo.org"], blockExplorerUrls: ["https://celoscan.io"] }],
    });
  }
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (String(chainId).toLowerCase() !== "0xa4ec") throw new Error("Please switch your wallet to Celo and try again.");
  return address;
}

export async function balances(address) {
  const out = {};
  await Promise.all(
    Object.entries(TOKENS).map(async ([sym, token]) => {
      const b = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address] });
      out[sym] = { atomic: b, display: Number(formatUnits(b, 6)) };
    })
  );
  return out;
}

/** fetch() that answers the API's 402 by signing an EIP-3009 authorization in the user's wallet. */
export function payingFetch(address, bal) {
  const wallet = createWalletClient({ account: address, chain: celo, transport: custom(window.ethereum) });
  const signer = toClientEvmSigner({ address, signTypedData: (m) => wallet.signTypedData({ account: address, ...m }) }, publicClient);
  const allowed = Object.values(TOKENS).map((asset) => ({ network: "eip155:42220", asset, maxAmountPerPayment: PRICE.toString() }));
  const client = x402Client.fromConfig({
    schemes: [{ network: "eip155:42220", client: new ExactEvmScheme(signer) }],
    spendControls: { maxAmountPerPayment: false, allowedAssets: allowed },
    // Pay with whichever accepted dollar token the user actually holds (MiniPay users mostly hold USD₮).
    paymentRequirementsSelector: (_v, reqs) => {
      const order = ["USDT", "USDC", "USAT"];
      for (const sym of order) {
        const r = reqs.find((q) => q.asset.toLowerCase() === TOKENS[sym].toLowerCase() && q.payTo.toLowerCase() === AGENT.toLowerCase());
        if (r && BigInt(r.amount) <= PRICE && (bal?.[sym]?.atomic ?? 0n) >= BigInt(r.amount)) return r;
      }
      throw new Error("You need $0.05 in USD₮, USDC or USA₮ on Celo for a personal scan.");
    },
  });
  return wrapFetchWithPayment(fetch, client);
}

/** Largest single-token balance: one payment is made in one token. */
export const bestBalance = (bal) => Math.max(0, ...Object.values(bal || {}).map((b) => b.display));
