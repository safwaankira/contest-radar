// POST /api/verdict  {"url": "https://x.com/.../status/..."}  or  {"text": "contest rules ..."}
// -> ENTER / MAYBE / SKIP with one evidence-backed check per rule, reasoned by SERV Reasoning (OpenServ).
//
// Free for people trying it (small hourly allowance per instance); agents and heavy users pay $0.01 over x402
// in USDC, USD₮ or USA₮ on Celo, same rails as /api/scan. A verdict costs us ~$0.003-0.006 in SERV credits.
import { verdict } from "../lib/verdict.js";
import { contestText } from "../lib/contest-text.js";

export const config = { maxDuration: 120 };

const FREE_PER_HOUR = Number(process.env.VERDICT_FREE_PER_HOUR || 40);
let window = { start: Date.now(), used: 0 };
const cache = new Map(); // url -> { at, out }, so the same link costs one SERV call per 30 min

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type, payment-signature, x-payment, access-control-expose-headers");
  res.setHeader("Access-Control-Expose-Headers", "payment-required, payment-response, x-payment-response");
  res.setHeader("Cache-Control", "no-store");
}

const fail = (res, status, error, extra = {}) => res.status(status).json({ error, ...extra });

function freeLeft() {
  if (Date.now() - window.start > 3_600_000) window = { start: Date.now(), used: 0 };
  return FREE_PER_HOUR - window.used;
}

async function paid(req, res) {
  // Loaded only on the paid path, so the free path needs no wallet configured.
  const { agent } = await import("../lib/chain.js");
  const { send402, verifyPayment, settlePayment } = await import("../lib/seller.js");
  let payTo;
  try { payTo = agent().account.address; } catch { return { blocked: fail(res, 503, "free verdicts are used up this hour and payments are not configured") }; }
  const header = req.headers["payment-signature"] || req.headers["x-payment"];
  if (!header) return { blocked: send402(res, payTo, "free verdicts are used up this hour; pay $0.01 to continue", "verdict") };
  const v = await verifyPayment(header, payTo);
  if (!v.ok) return { blocked: send402(res, payTo, v.reason, "verdict") };
  const s = await settlePayment(v, res);
  if (s.state === "failed") return { blocked: send402(res, payTo, `payment could not be settled: ${s.reason}`, "verdict") };
  return { payment: { payer: v.payer, tx: s.tx, status: s.state, token: v.req.extra.name, amount: "0.01" } };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST" && req.method !== "GET") return fail(res, 405, "use POST");
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const url = String(body.url ?? req.query?.url ?? "").trim().slice(0, 500);
  let text = String(body.text ?? "").slice(0, 12_000);
  if (!url && text.trim().length < 40) return fail(res, 400, 'send {"url":"https://..."} or {"text":"the contest rules, 40+ characters"}');

  const hit = url && !text && cache.get(url);
  if (hit && Date.now() - hit.at < 30 * 60_000) return res.status(200).json({ ...hit.out, cached: true });

  let payment = null;
  const wantsPaid = Boolean(req.headers["payment-signature"] || req.headers["x-payment"]);
  if (wantsPaid || freeLeft() <= 0) {
    const p = await paid(req, res).catch((e) => ({ blocked: fail(res, 503, "could not take payment right now; nothing was charged", { detail: e?.message }) }));
    if (p.blocked) return p.blocked;
    payment = p.payment;
  } else window.used++;

  let source = "text";
  try {
    if (url && !text) ({ text, source } = await contestText(url));
  } catch (e) {
    return fail(res, 422, e.message || "could not read that link; paste the contest text instead");
  }

  try {
    const out = await verdict(text, { now: new Date() });
    const result = { ...out, input: { url: url || null, source, chars: text.length }, payment, at: new Date().toISOString() };
    if (url && source !== "text") cache.set(url, { at: Date.now(), out: result });
    return res.status(200).json(result);
  } catch (e) {
    console.error("verdict error", e);
    return fail(res, 502, "SERV Reasoning did not return a verdict; try again", { detail: String(e?.message || e).slice(0, 200) });
  }
}
