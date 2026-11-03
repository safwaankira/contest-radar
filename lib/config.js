// Every address below was checked against Celo docs or a live 402 challenge.
export const CELO_CHAIN_ID = 42220;
export const NETWORK = "eip155:42220";
export const SANDBOX_NETWORK = "eip155:11142220";

export const RPC_URL = process.env.CELO_RPC_URL || "https://forno.celo.org";

// Attribution tag issued by Loops House for this entry (ERC-8021).
export const ATTRIBUTION_TAG = process.env.ATTRIBUTION_TAG || "celo_683ee8609385";

// Stablecoins on Celo mainnet. EIP-712 domains are what the token contracts report.
export const TOKENS = {
  USDC: {
    address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
    decimals: 6,
    domain: { name: "USDC", version: "2" },
    feeAdapter: "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B",
  },
  USDT: {
    address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e",
    decimals: 6,
    domain: { name: "Tether USD", version: "1" },
  },
  USAT: {
    address: "0xD2ab3C9A02DBBAB236BfEC45D1d755DF4267F771",
    decimals: 6,
    domain: { name: "Tether America USD", version: "1" },
  },
};
export const SANDBOX_USDC = "0x01C5C0122039549AD1493B8220cABEdD739BC44E";

// The agent pays gas in USDC through Celo fee abstraction, so it never needs CELO.
export const FEE_CURRENCY = TOKENS.USDC.feeAdapter;

// ERC-8004 registries on Celo mainnet.
export const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
export const REPUTATION_REGISTRY = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";

// buy gateway routes (prices from the live 402 challenges, Nov 3 2026).
export const BUY = {
  xSearch: { url: "https://gateway.usebuy.ai/v1/social/x/posts/search", price: 5000n },
  redditSearch: { url: "https://gateway.usebuy.ai/v1/social/reddit/posts/search", price: 5000n },
  youtubeSearch: { url: "https://gateway.usebuy.ai/v1/social/youtube/videos/search", price: 5000n },
  // buy's Cencori route only accepts maximo-atlas-1.3, which Cencori has retired (Nov 3 2026),
  // so every call is charged and then fails. Kept behind LLM_PROVIDER=cencori for when buy fixes it.
  cencori: { url: "https://gateway.usebuy.ai/cencori/v1/chat/completions", price: 10000n, model: process.env.CENCORI_MODEL || "maximo-atlas-1.3" },
  // Agent402 (listed in buy's catalogue): metered OpenAI-compatible chat, priced per request body.
  // A 25 KB prompt with gpt-4o-mini quoted at $0.004235 in Celo USDC.
  agent402: { url: "https://agent402.tools/v1/metered/chat/completions", price: 20000n, model: process.env.AGENT402_MODEL || "openai/gpt-4o-mini" },
  sandboxFund: "https://gateway.usebuy.ai/v1/sandbox/fund",
};

// The only addresses the agent will ever pay (from live 402 challenges, Nov 3 2026).
export const KNOWN_PAYEES = [
  "0x20faAca5F980E29639A0FCC6dcA6988E18ed333B", // buy gateway
  "0xaBF4FAbd7c416fB67202E5f9002389Fc75e2a9D0", // Agent402
].map((a) => a.toLowerCase());

// Hard caps so a bug can never drain the float.
export const MAX_PER_CALL = 20000n; // $0.02, in 6-decimal units
export const MAX_PER_RUN = [BigInt(process.env.MAX_PER_RUN_ATOMIC || 80000), 100000n].reduce((a, b) => (a < b ? a : b)); // $0.08 per run, never above $0.10

// What a personal scan costs the buyer, in 6-decimal units ($0.05).
export const SCAN_PRICE = BigInt(process.env.SCAN_PRICE_ATOMIC || 50000);

export const POIDH_FEED = "https://poidh.xyz/bounties/data";

export const LLM_PROVIDER = process.env.LLM_PROVIDER || "agent402";

export const SITE_URL = process.env.SITE_URL || "https://contest-radar-celo.vercel.app";
