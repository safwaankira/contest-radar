import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { erc20Abi } from "viem";
import { NETWORK, TOKENS, SCAN_PRICE, SITE_URL } from "./config.js";
import { agent, facilitatorSigner, writeTagged } from "./chain.js";

// A buyer's authorization must stay valid long enough to settle with margin (Vercel maxDuration is 120s).
const MIN_VALIDITY_S = 150;

let facilitator;
function getFacilitator() {
  facilitator ??= new ExactEvmScheme(facilitatorSigner());
  return facilitator;
}

/** What a personal scan costs, in the three dollar stablecoins we accept. */
export function scanRequirements(payTo) {
  return ["USDC", "USDT", "USAT"].map((sym) => ({
    scheme: "exact",
    network: NETWORK,
    asset: TOKENS[sym].address,
    amount: SCAN_PRICE.toString(),
    payTo,
    maxTimeoutSeconds: 300,
    extra: { ...TOKENS[sym].domain },
  }));
}

export function paymentRequired(payTo, error = "") {
  return {
    x402Version: 2,
    error,
    resource: {
      url: `${SITE_URL}/api/scan`,
      description:
        "Contest Radar personal scan: searches X, Reddit and poidh for open crypto contests and bounties matching your keywords, " +
        "reads each one and returns them ranked by prize, deadline, effort and competition. POST {\"keywords\":\"meme OR design\"}.",
      mimeType: "application/json",
    },
    accepts: scanRequirements(payTo),
  };
}

export function send402(res, payTo, error = "") {
  const body = paymentRequired(payTo, error);
  res.setHeader("PAYMENT-REQUIRED", encodePaymentRequiredHeader(body));
  return res.status(402).json(body);
}

/**
 * Decode and verify the buyer's signed authorization against OUR requirements. Nothing moves yet.
 * Also refuses authorizations that would expire before settlement could land.
 */
export async function verifyPayment(header, payTo, now = Math.floor(Date.now() / 1000)) {
  let payload;
  try { payload = decodePaymentSignatureHeader(header); } catch { return { ok: false, reason: "malformed payment header" }; }
  const accepted = payload?.accepted;
  const req = scanRequirements(payTo).find(
    (r) => accepted && r.network === accepted.network && r.asset.toLowerCase() === String(accepted.asset).toLowerCase()
  );
  if (!req) return { ok: false, reason: "unsupported token or network" };
  if (String(accepted.amount) !== req.amount || String(accepted.payTo).toLowerCase() !== payTo.toLowerCase()) {
    return { ok: false, reason: "amount or recipient does not match the quote" };
  }
  const auth = payload?.payload?.authorization;
  if (!auth?.nonce || !auth?.validBefore) return { ok: false, reason: "only EIP-3009 authorizations are accepted" };
  if (Number(auth.validBefore) - now < MIN_VALIDITY_S) return { ok: false, reason: `authorization must stay valid for at least ${MIN_VALIDITY_S}s` };

  const v = await getFacilitator().verify(payload, req);
  if (!v.isValid) return { ok: false, reason: v.invalidReason || "invalid payment" };
  return { ok: true, payload, req, payer: v.payer, nonce: String(auth.nonce).toLowerCase() };
}

/**
 * Submit the buyer's authorization onchain from the agent wallet (tagged, gas in USDC).
 * Returns { state: "settled" | "pending" | "failed", ... }. "pending" means the transaction was
 * broadcast but its receipt did not arrive in time; it will almost always land, so the scan proceeds.
 */
export async function settlePayment({ payload, req }, res) {
  let s;
  try {
    s = await getFacilitator().settle(payload, req);
  } catch (e) {
    return { state: "failed", reason: "settlement error" , internal: e?.message };
  }
  if (s.success) {
    const receipt = encodePaymentResponseHeader(s);
    res.setHeader("PAYMENT-RESPONSE", receipt);
    res.setHeader("X-PAYMENT-RESPONSE", receipt); // older clients (buy CLI 0.8.x) read this name
    return { state: "settled", tx: s.transaction, payer: s.payer };
  }
  if (s.errorReason === "settlement_pending" && s.transaction) return { state: "pending", tx: s.transaction, payer: s.payer };
  return { state: "failed", reason: s.errorReason || "settlement failed" };
}

/** Send a settled payment back when the paid scan could not produce anything (tagged, gas in USDC). */
export async function refund({ req, payer }) {
  const send = () => writeTagged({ address: req.asset, abi: erc20Abi, functionName: "transfer", args: [payer, BigInt(req.amount)] });
  try {
    return (await send()).hash;
  } catch (e) {
    if (!/nonce/i.test(e?.message || "")) throw e;
    return (await send()).hash; // another instance used the same nonce; one retry with a fresh one
  }
}

/** Keep a reserve so the agent can always cover a refund and its own daily run. */
export async function agentCanAfford(minAtomic = 100000n) {
  const { publicClient, account } = agent();
  const bal = await publicClient.readContract({ address: TOKENS.USDC.address, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  return bal >= minAtomic;
}
