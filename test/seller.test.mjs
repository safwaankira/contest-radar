import { test } from "node:test";
import assert from "node:assert/strict";
import { encodePaymentSignatureHeader } from "@x402/core/http";
import { verifyPayment, scanRequirements } from "../lib/seller.js";

const payTo = "0x6859Abd01F1686E9DDfE809CC69Fab1054447457";
const now = 1_800_000_000;
const header = (over = {}, auth = {}) => {
  const req = scanRequirements(payTo)[0];
  return encodePaymentSignatureHeader({
    x402Version: 2,
    accepted: { ...req, ...over },
    payload: { signature: "0x" + "11".repeat(65), authorization: { from: "0x" + "22".repeat(20), to: payTo, value: req.amount, validAfter: "0", validBefore: String(now + 600), nonce: "0x" + "33".repeat(32), ...auth } },
  });
};

// These checks run before any RPC call, so no network is needed.
test("rejects a lower amount, another recipient, or an unknown token before touching the chain", async () => {
  assert.match((await verifyPayment(header({ amount: "1" }), payTo, now)).reason, /amount or recipient/);
  assert.match((await verifyPayment(header({ payTo: "0x" + "44".repeat(20) }), payTo, now)).reason, /amount or recipient/);
  assert.match((await verifyPayment(header({ asset: "0x" + "55".repeat(20) }), payTo, now)).reason, /unsupported token/);
  assert.match((await verifyPayment("not-base64!", payTo, now)).reason, /malformed/);
});

test("rejects authorizations that would expire before settlement lands", async () => {
  const r = await verifyPayment(header({}, { validBefore: String(now + 30) }), payTo, now);
  assert.equal(r.ok, false);
  assert.match(r.reason, /valid for at least/);
});
