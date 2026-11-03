import { ExactEvmScheme } from "@x402/evm/exact/facilitator";
import { decodePaymentSignatureHeader, encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { erc20Abi } from "viem";
import { NETWORK, TOKENS, SCAN_PRICE, SITE_URL } from "./config.js";
import { agent, facilitatorSigner } from "./chain.js";

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
        "reads each one and returns them ranked by prize, deadline and effort. POST {\"keywords\":\"meme OR design\"}.",
      mimeType: "application/json",
    },
    accepts: scanRequirements(payTo),
  };
}

export function send402(res, payTo, error = "") {
  const body = paymentRequired(payTo, error);
  res.setHeader("PAYMENT-REQUIRED", encodePaymentRequiredHeader(body));
  res.setHeader("Cache-Control", "no-store");
  return res.status(402).json(body);
}

/** Decode and verify the buyer's signed authorization. Nothing moves yet. */
export async function verifyPayment(header, payTo) {
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
  const v = await getFacilitator().verify(payload, req);
  if (!v.isValid) return { ok: false, reason: v.invalidReason || "invalid payment" };
  return { ok: true, payload, req, payer: v.payer };
}

/** Submit the buyer's authorization onchain from the agent wallet (tagged, gas in USDC). */
export async function settlePayment({ payload, req }, res) {
  const s = await getFacilitator().settle(payload, req);
  if (s.success) res.setHeader("PAYMENT-RESPONSE", encodePaymentResponseHeader(s));
  return s;
}

/** Refuse new paid work if the agent could not cover the buy calls it would make. */
export async function agentCanAfford(minAtomic = 40000n) {
  const { publicClient, account } = agent();
  const bal = await publicClient.readContract({ address: TOKENS.USDC.address, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  return bal >= minAtomic;
}
