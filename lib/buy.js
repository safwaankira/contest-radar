import { x402Client } from "@x402/core/client";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { createPublicClient, http, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { celo, celoSepolia } from "viem/chains";
import {
  NETWORK, SANDBOX_NETWORK, TOKENS, SANDBOX_USDC, MAX_PER_CALL, MAX_PER_RUN, RPC_URL, BUY, LLM_PROVIDER, KNOWN_PAYEES,
} from "./config.js";

/**
 * A spending session: one per scan run. It pays buy's 402 challenges from the agent
 * wallet in USDC, refuses anything over the per-call or per-run cap, and records a
 * receipt (route, amount, settlement tx) for every paid call.
 *
 * sandbox=true pays the gateway's Celo Sepolia offer with test USDC instead.
 */
export function createBuySession({ sandbox = process.env.BUY_SANDBOX === "1", label = "scan", deadline = null } = {}) {
  const pk = sandbox ? process.env.SANDBOX_PRIVATE_KEY : process.env.AGENT_PRIVATE_KEY;
  if (!pk || !isHex(pk)) throw new Error(sandbox ? "SANDBOX_PRIVATE_KEY missing" : "AGENT_PRIVATE_KEY missing");
  const account = privateKeyToAccount(pk);
  const publicClient = createPublicClient({
    chain: sandbox ? celoSepolia : celo,
    transport: http(sandbox ? undefined : RPC_URL),
  });
  const network = sandbox ? SANDBOX_NETWORK : NETWORK;
  const asset = (sandbox ? SANDBOX_USDC : TOKENS.USDC.address).toLowerCase();

  const receipts = [];
  let committed = 0n; // spent or in flight this run
  let lastQuote = 0n; // most recent accepted quote; only read for the model call, which runs alone

  const client = x402Client.fromConfig({
    schemes: [{ network, client: new ExactEvmScheme(toClientEvmSigner(account, publicClient)) }],
    spendControls: { maxAmountPerPayment: false, allowedAssets: [{ network, asset, maxAmountPerPayment: MAX_PER_CALL.toString() }] },
    // Only ever pay in USDC on the intended network.
    paymentRequirementsSelector: (_v, reqs) => {
      const pick = reqs.find((r) => r.network === network && r.asset.toLowerCase() === asset);
      if (!pick) throw new Error(`no ${network} USDC offer`);
      if (!KNOWN_PAYEES.includes(String(pick.payTo).toLowerCase())) throw new Error(`refusing unknown payee ${pick.payTo}`);
      const amount = BigInt(pick.amount);
      if (amount > MAX_PER_CALL) throw new Error(`quote ${amount} over per-call cap`);
      if (committed + amount > MAX_PER_RUN) throw new Error(`run budget exhausted (${committed}/${MAX_PER_RUN})`);
      committed += amount;
      lastQuote = amount;
      return pick;
    },
  });
  const payFetch = wrapFetchWithPayment(fetch, client);

  /** POST JSON to a buy route, pay if asked, return parsed body + receipt. */
  async function call(route, body) {
    const started = Date.now();
    const res = await payFetch(route, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: deadline ? AbortSignal.any([AbortSignal.timeout(30_000), deadline]) : AbortSignal.timeout(30_000),
    });
    const header = res.headers.get("payment-response") || res.headers.get("x-payment-response");
    const settlement = header ? safeDecode(header) : null;
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 500) }; }
    const receipt = {
      label,
      route: new URL(route).pathname,
      status: res.status,
      paid: Boolean(settlement?.success),
      // A paid failure has no body receipt; fall back to the route's quoted price.
      amountUsd: json?.payment?.usd ?? (settlement?.success ? (Number(lastQuote || priceFor(route)) / 1e6).toFixed(6) : "0"),
      tx: settlement?.transaction || json?.transaction || null,
      network: sandbox ? "celo-sepolia" : "celo",
      ms: Date.now() - started,
      at: new Date().toISOString(),
    };
    receipts.push(receipt);
    if (!res.ok) {
      const err = new Error(`${receipt.route} -> HTTP ${res.status}: ${text.slice(0, 600)}`);
      err.receipt = receipt;
      err.paid = receipt.paid; // a paid failure must never be retried blindly
      throw err;
    }
    return { json, receipt };
  }

  return {
    address: account.address,
    sandbox,
    receipts,
    spentAtomic: () => committed,
    xSearch: (query, type = "latest") => call(BUY.xSearch.url, { query, type }),
    redditSearch: (query, opts = {}) =>
      call(BUY.redditSearch.url, { query, sort: opts.sort || "new", timeRange: opts.timeRange || "week" }),
    youtubeSearch: (query) => call(BUY.youtubeSearch.url, { query }),
    chat: (messages, max_tokens = 4096) => {
      const llm = BUY[LLM_PROVIDER] || BUY.agent402;
      return call(llm.url, { model: llm.model, max_tokens, temperature: 0.1, messages });
    },
    llm: () => (BUY[LLM_PROVIDER] || BUY.agent402).model,
    browser: (minutes = 3) => openBrowser(call, minutes),
  };
}

/**
 * A paid buy browser session. Returns { read(url), close() }. The access token stays in this closure and
 * is never logged; page text is untrusted input and is only ever handed to the model as data.
 */
async function openBrowser(call, minutes) {
  const { json } = await call(BUY.browser.url, { durationMinutes: minutes });
  const b = json?.browser;
  if (!b?.commandUrl || !b?.accessToken) throw new Error("browser session: no command URL in response");
  for (const u of [b.commandUrl, b.statusUrl]) {
    if (u && new URL(u).origin !== new URL(BUY.browser.url).origin) throw new Error("browser session: unexpected command host");
  }
  const expires = Date.parse(b.expiresAt) || Date.now() + minutes * 60_000;
  const auth = { authorization: `Bearer ${b.accessToken}`, "content-type": "application/json" };
  const cmd = async (body, ms) => {
    const left = expires - Date.now() - 3_000;
    if (left < 2_000) throw new Error("browser session: out of time");
    const res = await fetch(b.commandUrl, { method: "POST", headers: auth, body: JSON.stringify(body), signal: AbortSignal.timeout(Math.min(ms, left)) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok || out?.output?.success === false) throw new Error(`browser ${body.action}: ${out?.error || out?.output?.error || `HTTP ${res.status}`}`);
    return out.output?.data ?? {};
  };
  return {
    async read(url) {
      await cmd({ action: "open", url }, 40_000);
      const { text = "" } = await cmd({ action: "get", kind: "text", target: "body" }, 15_000);
      return String(text).slice(0, 20_000);
    },
    async close() {
      if (!b.statusUrl) return;
      await fetch(b.statusUrl, { method: "DELETE", headers: auth, signal: AbortSignal.timeout(10_000) }).catch(() => {});
    },
  };
}

function priceFor(route) {
  return Object.values(BUY).find((r) => r?.url === route)?.price ?? 0n;
}

function safeDecode(h) {
  try { return decodePaymentResponseHeader(h); } catch { return null; }
}

/** Ask the gateway faucet for 1 test USDC on Celo Sepolia (sandbox only). */
export async function fundSandbox(address) {
  const r = await fetch(BUY.sandboxFund, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address }),
  });
  return { status: r.status, body: await r.text() };
}
