// Register the agent's ERC-8004 identity on Celo mainnet from the agent wallet.
// The registration file is served at SITE_URL/agent.json. Run once:
//   node --env-file=.env scripts/register.js
// After it prints the agentId, put it in public/agent.json "registrations" and redeploy.
import { parseEventLogs } from "viem";
import { IDENTITY_REGISTRY, SITE_URL } from "../lib/config.js";
import { writeTagged, agent } from "../lib/chain.js";

const abi = [
  { type: "function", name: "register", stateMutability: "nonpayable", inputs: [{ name: "agentURI", type: "string" }], outputs: [{ name: "agentId", type: "uint256" }] },
  { type: "event", name: "Registered", inputs: [{ name: "agentId", type: "uint256", indexed: true }, { name: "agentURI", type: "string" }, { name: "owner", type: "address", indexed: true }] },
];

const uri = `${SITE_URL}/agent.json`;
console.log("registering", agent().account.address, "->", uri);
const { hash, receipt } = await writeTagged({ address: IDENTITY_REGISTRY, abi, functionName: "register", args: [uri] });
const [ev] = parseEventLogs({ abi, eventName: "Registered", logs: receipt.logs });
console.log(JSON.stringify({ tx: hash, agentId: ev?.args?.agentId?.toString() }));
