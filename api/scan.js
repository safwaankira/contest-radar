import { agent } from "../lib/chain.js";
import { send402, verifyPayment, settlePayment, agentCanAfford } from "../lib/seller.js";
import { runScan } from "../lib/scan.js";

export const config = { maxDuration: 120 };

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, payment-signature, x-payment");
  res.setHeader("Access-Control-Expose-Headers", "payment-required, payment-response, x-payment-response");
}

function readKeywords(req) {
  const raw = (req.body && typeof req.body === "object" ? req.body.keywords : null) ?? req.query?.keywords ?? "";
  // Letters, digits, spaces and OR only: this string goes into a search query.
  return String(raw).replace(/[^\p{L}\p{N} ]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST" && req.method !== "GET") return res.status(405).json({ error: "use POST" });

  const payTo = agent().account.address;
  const header = req.headers["payment-signature"] || req.headers["x-payment"];
  if (!header) return send402(res, payTo);

  const keywords = readKeywords(req);
  if (keywords.length < 3) return res.status(400).json({ error: "keywords required, e.g. {\"keywords\":\"meme OR design\"}" });

  if (!(await agentCanAfford())) return res.status(503).json({ error: "agent is out of float; nothing was charged" });

  const v = await verifyPayment(header, payTo);
  if (!v.ok) return send402(res, payTo, v.reason);

  // Do the work first; the buyer is only charged if a ranked result comes back.
  let result;
  try {
    result = await runScan({ keywords, label: "personal" });
  } catch (e) {
    return res.status(502).json({ error: "scan failed; your payment was not settled", detail: e.message });
  }

  const s = await settlePayment(v, res).catch((e) => ({ success: false, errorReason: e.message }));
  if (!s.success) return send402(res, payTo, `settlement failed: ${s.errorReason || "unknown"}`);

  return res.status(200).json({ ...result, payment: { payer: v.payer, tx: s.transaction, token: v.req.extra.name, amount: "0.05" } });
}
