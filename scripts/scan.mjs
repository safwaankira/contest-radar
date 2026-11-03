#!/usr/bin/env node
// Buy one personal scan from the command line, paying from your own Celo wallet.
//   CONTEST_RADAR_PAYER_KEY=0x... npm run scan -- "meme OR design"
import { paidScan } from "../lib/scan-client.js";

const keywords = process.argv.slice(2).join(" ");
const body = await paidScan({ keywords, privateKey: process.env.CONTEST_RADAR_PAYER_KEY });
console.log(`paid ${body.payment?.amount} ${body.payment?.token} (tx ${body.payment?.tx}), ${body.items?.length ?? 0} items`);
for (const i of (body.items ?? []).slice(0, 15)) console.log(`${String(i.score).padStart(3)}  ${i.title}  ${i.url}`);
