import { agent } from "../lib/chain.js";
import { send402, verifyPayment, settlePayment, refund, agentCanAfford } from "../lib/seller.js";
import { runScan } from "../lib/scan.js";
import { SCAN_PRICE } from "../lib/config.js";

export const config = { maxDuration: 120 };

const BUDGET_MS = 100_000; // stay well inside maxDuration so a paid request always gets an answer
const REFUND_NEEDS_MS = 30_000; // time a refund needs to be sent and confirmed

// Per-instance guards. Payment is settled before any work, so these protect the shared wallet's
// nonce and the time budget, not the money.
let active = 0;
const MAX_CONCURRENT = 2;
const seenNonces = new Map(); // authorization nonce -> expiry (ms); kept until the authorization expires

function rememberNonce(nonce, validBeforeS) {
  const now = Date.now();
  for (const [n, exp] of seenNonces) if (exp < now) seenNonces.delete(n);
  seenNonces.set(nonce, Math.max(now + 60_000, Number(validBeforeS) * 1000));
}

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

const fail = (res, status, error, extra = {}) => res.status(status).json({ error, ...extra });

export default async function handler(req, res) {
  const started = Date.now();
  const left = () => BUDGET_MS - (Date.now() - started);
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST" && req.method !== "GET") return fail(res, 405, "use POST");

  let payTo;
  try { payTo = agent().account.address; } catch { return fail(res, 503, "agent not configured"); }

  const header = req.headers["payment-signature"] || req.headers["x-payment"];
  if (!header) return send402(res, payTo);

  const keywords = readKeywords(req);
  if (keywords.length < 3) return fail(res, 400, 'keywords required, e.g. {"keywords":"meme OR design"}');

  // Reserve a slot before the first await so concurrent requests can't all slip past the check.
  if (active >= MAX_CONCURRENT) { res.setHeader("Retry-After", "30"); return fail(res, 429, "busy, nothing was charged; retry in 30s"); }
  active++;
  try {
    let v;
    try {
      if (!(await agentCanAfford())) return fail(res, 503, "agent float is low; nothing was charged");
      v = await verifyPayment(header, payTo);
    } catch (e) {
      console.error("verify error", e);
      return fail(res, 503, "could not verify payment right now; nothing was charged");
    }
    if (!v.ok) return send402(res, payTo, v.reason);
    if (seenNonces.has(v.nonce)) return fail(res, 409, "this authorization was already used");
    rememberNonce(v.nonce, v.payload.payload.authorization.validBefore);
    if (left() < 75_000) return fail(res, 503, "ran out of time before charging; nothing was charged");

    // 1. Take the payment first. No paid calls happen until the buyer's money has moved.
    const s = await settlePayment(v, res);
    if (s.state === "failed") {
      if (s.internal) console.error("settle error", s.internal);
      return send402(res, payTo, `payment could not be settled: ${s.reason}`);
    }

    // 2. Do the work within what is left of the budget, keeping time for a refund.
    const deadline = AbortSignal.timeout(Math.max(5_000, left() - REFUND_NEEDS_MS));
    let result = null;
    try {
      result = await runScan({ keywords, label: "personal", deadline });
    } catch (e) {
      console.error("scan error", e);
    }

    // 3. Charged but the paid sources produced nothing: send the money back.
    if (!result || result.paidOk === 0) {
      let refundTx = null;
      if (s.state === "settled") {
        try { refundTx = await refund({ req: v.req, payer: v.payer }); } catch (e) {
          // Logged in a fixed format so failed refunds can be found and sent by hand.
          console.error(`REFUND_FAILED payer=${v.payer} token=${v.req.asset} amount=${v.req.amount} paymentTx=${s.tx}`, e?.message);
        }
      }
      return fail(res, 502, "the paid sources were unavailable, so this scan was refunded", {
        refunded: Boolean(refundTx), refundTx, paymentTx: s.tx, paymentStatus: s.state,
        items: result?.items ?? [],
      });
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
    active--;
  }
}
