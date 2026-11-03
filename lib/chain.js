import { createPublicClient, createWalletClient, http, concat, isHex, nonceManager } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo } from "viem/chains";
import { toDataSuffix } from "@celo/attribution-tags";
import { RPC_URL, ATTRIBUTION_TAG, FEE_CURRENCY } from "./config.js";

export const TAG_SUFFIX = toDataSuffix(ATTRIBUTION_TAG);

let cached;

/** Agent wallet + clients. The key only ever comes from the environment. */
export function agent() {
  if (cached) return cached;
  const pk = process.env.AGENT_PRIVATE_KEY;
  if (!pk || !isHex(pk)) throw new Error("AGENT_PRIVATE_KEY missing");
  const account = privateKeyToAccount(pk, { nonceManager });
  // No automatic retries for sends: a timed-out send may have landed, and a resend could double-spend a nonce slot.
  const sendTransport = http(RPC_URL, { retryCount: 0, timeout: 20_000 });
  const readTransport = http(RPC_URL, { retryCount: 2, timeout: 15_000 }); // reads are safe to retry
  const publicClient = createPublicClient({ chain: celo, transport: readTransport });
  const walletClient = createWalletClient({ account, chain: celo, transport: sendTransport });
  cached = { account, publicClient, walletClient };
  return cached;
}

/**
 * Every transaction the agent sends goes through here:
 * gas is paid in USDC (fee abstraction) and the ERC-8021 attribution tag is appended.
 */
export async function sendTagged({ to, data = "0x", value = 0n }) {
  const { walletClient, publicClient } = agent();
  const hash = await walletClient.sendTransaction({
    to,
    data: concat([data, TAG_SUFFIX]),
    value,
    feeCurrency: FEE_CURRENCY,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`);
  return { hash, receipt };
}

export async function writeTagged({ address, abi, functionName, args, gas }) {
  const { walletClient, publicClient, account } = agent();
  const { request } = await publicClient.simulateContract({ account, address, abi, functionName, args });
  const hash = await walletClient.writeContract({
    ...request,
    gas,
    dataSuffix: TAG_SUFFIX,
    feeCurrency: FEE_CURRENCY,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error(`tx reverted: ${hash}`);
  return { hash, receipt };
}

/**
 * x402 facilitator signer backed by the agent wallet. Settlement transactions
 * are sent by the agent itself, so they carry the attribution tag and pay gas in USDC.
 */
export function facilitatorSigner() {
  const { account, publicClient, walletClient } = agent();
  return {
    getAddresses: () => [account.address],
    readContract: (args) => publicClient.readContract(args),
    verifyTypedData: (args) => publicClient.verifyTypedData(args),
    writeContract: (args) =>
      walletClient.writeContract({
        ...args,
        dataSuffix: TAG_SUFFIX,
        feeCurrency: FEE_CURRENCY,
      }),
    sendTransaction: ({ to, data }) =>
      walletClient.sendTransaction({ to, data: concat([data, TAG_SUFFIX]), feeCurrency: FEE_CURRENCY }),
    // Capped so settle + scan fit inside the function's time budget; a slower receipt is reported as pending.
    waitForTransactionReceipt: ({ hash, timeout }) =>
      publicClient.waitForTransactionReceipt({ hash, timeout: Math.min(timeout ?? 25_000, 25_000) }),
    getCode: ({ address }) => publicClient.getCode({ address }),
  };
}
