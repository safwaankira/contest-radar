import { agent } from "../lib/chain.js";
import { send402, verifyPayment, settlePayment, refund, agentCanAfford } from "../lib/seller.js";
import { runScan } from "../lib/scan.js";
import { SCAN_PRICE } from "../lib/config.js";

export const config = { maxDuration: 120 };

// Per-instance guards. Settling before any work means a scan is always paid for first,
// so these only protect the shared wallet's nonce and the 120s budget.
const inFlight = new Set(); // authorization nonces being processed
const MAX_CONCURRENT = 2;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, payment-signature, x-payment, access-control-expose-headers");
  res.setHeader("Access-Control-Expose-Headers", "payment-required, payment-response, x-payment-response");
  res.setHeader("Cache-Control", "no-store");
}

function readKeywords(req) {
  const raw = (req.body && typeof req.body === "object" ? req.body.keywords : null) ?? req.query?.keywords ?? "";
  // Letters, digits and spaces only: this string goes into a search query.
  return String(raw).replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

const fail = (res, status, error) => res.status(status).json({ error });

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST" && req.method !== "GET") return fail(res, 405, "use POST");

  let payTo;
  try { payTo = agent().account.address; } catch { return fail(res, 503, "agent not configured"); }

  const header = req.headers["payment-signature"] || req.headers["x-payment"];
  if (!header) return send402(res, payTo);

  const keywords = readKeywords(req);
  if (keywords.length < 3) return fail(res, 400, 'keywords required, e.g. {"keywords":"meme OR design"}');
  if (inFlight.size >= MAX_CONCURRENT) { res.setHeader("Retry-After", "30"); return fail(res, 429, "busy, nothing was charged; retry in 30s"); }

  let v;
  try {
    if (!(await agentCanAfford())) return fail(res, 503, "agent float is low; nothing was charged");
    v = await verifyPayment(header, payTo);
  } catch (e) {
    console.error("verify error", e);
    return fail(res, 503, "could not verify payment right now; nothing was charged");
  }
  if (!v.ok) return send402(res, payTo, v.reason);
  if (inFlight.has(v.nonce)) return fail(res, 409, "this authorization is already being processed");
  inFlight.add(v.nonce);

  try {
    // 1. Take the payment first. No buy calls happen until the buyer's money has moved.
    const s = await settlePayment(v, res);
    if (s.state === "failed") {
      if (s.internal) console.error("settle error", s.internal);
      return send402(res, payTo, `payment could not be settled: ${s.reason}`);
    }

    // 2. Do the work.
    let result;
    try {
      result = await runScan({ keywords, label: "personal" });
    } catch (e) {
      console.error("scan error", e);
      result = null;
    }

    // 3. Paid but nothing to show because the scan itself broke: send the money back.
    if (!result) {
      let refundTx = null;
      if (s.state === "settled") {
        try { refundTx = await refund({ req: v.req, payer: v.payer }); } catch (e) { console.error("refund error", e); }
      }
      return res.status(502).json({ error: "scan failed", refunded: Boolean(refundTx), refundTx, paymentTx: s.tx });
    }

    const { receipts, errors, ...pub } = result;
    return res.status(200).json({
      ...pub,
      paidCalls: receipts.filter((r) => r.paid).map(({ route, amountUsd, tx }) => ({ route, amountUsd, tx })),
      warnings: errors.length ? errors.map((e) => e.split(":")[0]) : [],
      payment: {
        payer: v.payer,
        tx: s.tx,
        status: s.state,
        token: v.req.extra.name,
        amount: (Number(SCAN_PRICE) / 1e6).toFixed(2),
      },
    });
  } finally {
    inFlight.delete(v.nonce);
  }
}
