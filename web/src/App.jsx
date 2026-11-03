import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Clock, Users, ShieldAlert, Wallet, Search, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, AGENT, BUY_PAYTO, EXPLORER, short, usd, daysLeft, ago } from "@/lib/utils";

// Wallet and x402 code (viem, @x402/*) loads only when someone opens the paid scan.
const wallet = () => import("@/lib/wallet");
const hasWallet = () => typeof window !== "undefined" && Boolean(window.ethereum);
const isMiniPay = () => Boolean(window.ethereum?.isMiniPay);

const TABS = [
  { id: "radar", label: "Radar" },
  { id: "scan", label: "My scan" },
  { id: "agent", label: "The agent" },
];
const SOURCES = [["all", "All sources"], ["x", "X"], ["poidh", "poidh"], ["reddit", "Reddit"], ["github", "GitHub"]];
const CLASSES = [["all", "Any class"], ["quick-win", "Quick win"], ["high-value", "High value"], ["rail-watch", "Rail watch"], ["standard", "Standard"], ["manual-review", "Manual review"]];
const PRESETS = ["meme", "thread", "design", "video", "code"];
const AGENT402_PAYTO = "0xaBF4FAbd7c416fB67202E5f9002389Fc75e2a9D0";

export default function App() {
  const [tab, setTab] = useState(() => (["radar", "scan", "agent"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "radar"));
  useEffect(() => { if (location.hash.slice(1) !== tab) history.pushState(null, "", `#${tab}`); window.scrollTo({ top: 0 }); }, [tab]);
  useEffect(() => {
    const onHash = () => { const h = location.hash.slice(1); if (["radar", "scan", "agent"].includes(h)) setTab(h); };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("popstate", onHash); };
  }, []);
  const [feed, setFeed] = useState(null);
  const [prefill, setPrefill] = useState("");
  useEffect(() => {
    fetch("/feed/latest.json").then((r) => r.json()).then(setFeed).catch(() => setFeed({ items: [], errors: [{ message: "feed unavailable" }] }));
  }, []);
  const goScan = (kw = "") => { setPrefill(kw); setTab("scan"); };

  return (
    <div className="min-h-screen">
      <TopNav tab={tab} setTab={setTab} />
      <main className="mx-auto max-w-[1080px] px-4 pb-24 sm:px-6">
        {tab === "radar" && <RadarView feed={feed} onScan={goScan} />}
        {tab === "scan" && <ScanView prefill={prefill} />}
        {tab === "agent" && <AgentView feed={feed} />}
      </main>
      <Footer />
    </div>
  );
}

function Mark({ className }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeOpacity=".35" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="7.5" fill="none" stroke="currentColor" strokeOpacity=".6" strokeWidth="1.5" />
      <path d="M16 16 L26 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="22.5" cy="10.8" r="2.2" fill="currentColor" />
    </svg>
  );
}

function TopNav({ tab, setTab }) {
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1080px] items-center justify-between gap-3 px-4 sm:px-6">
        <a href="#radar" onClick={(e) => { e.preventDefault(); setTab("radar"); }} className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.3px]">
          <Mark className="size-6 text-primary" />
          <span className="hidden whitespace-nowrap min-[420px]:inline">Contest Radar</span>
        </a>
        <nav className="flex gap-1 rounded-full border border-hairline bg-canvas p-1" aria-label="Sections">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={cn(
                "h-8 whitespace-nowrap rounded-full px-2.5 text-[13px] font-medium transition-colors sm:px-3.5",
                tab === id ? "bg-surface-2 text-ink" : "text-ink-subtle hover:text-ink"
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-hairline">
      <div className="mx-auto flex max-w-[1080px] flex-wrap gap-x-6 gap-y-2 px-4 py-10 text-[12px] text-ink-subtle sm:px-6">
        <span className="flex items-center gap-1.5 text-ink-muted"><Mark className="size-4 text-primary" /> Contest Radar</span>
        <a className="hover:text-ink" href="https://github.com/safwaankira/contest-radar">Source</a>
        <a className="hover:text-ink" href="https://github.com/go165/bounty-radar">Built on bounty-radar</a>
        <a className="hover:text-ink" href="https://usebuy.ai">Data bought through buy</a>
        <a className="hover:text-ink" href={`${EXPLORER}/address/${AGENT}`}>Agent {short(AGENT)}</a>
        <a className="hover:text-ink" href="/llms.txt">llms.txt</a>
      </div>
    </footer>
  );
}

function RadarView({ feed, onScan }) {
  const [source, setSource] = useState("all");
  const [klass, setKlass] = useState("all");
  const [q, setQ] = useState("");
  const items = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (feed?.items || [])
      .filter((i) => source === "all" || (i.source || "github") === source)
      .filter((i) => klass === "all" || i.opportunity_class === klass)
      .filter((i) => words.every((w) => `${i.title} ${i.task || ""} ${i.repo} ${i.kind || ""}`.toLowerCase().includes(w)));
  }, [feed, source, klass, q]);
  const closingSoon = (feed?.items || []).filter((i) => { const d = daysLeft(i.deadline); return d != null && d >= 0 && d <= 3; }).length;

  return (
    <>
      <section className="pt-14 pb-10 sm:pt-20">
        <p className="eyebrow">Daily, from X, poidh, Reddit and GitHub</p>
        <h1 className="display-md mt-3 max-w-[18ch]">Contests worth entering, before they close.</h1>
        <p className="mt-4 max-w-[58ch] text-[17px] leading-[1.5] text-ink-subtle">
          An agent reads every new bounty and contest post each morning, drops the scams and the closed ones, and ranks the rest by prize, time left, effort and how crowded they are. It pays for its own data on Celo.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button size="lg" onClick={() => onScan()}><Search /> Scan for my niche · $0.05</Button>
          <Button size="lg" variant="secondary" onClick={() => document.getElementById("radar")?.scrollIntoView({ behavior: "smooth" })}>See today's list</Button>
        </div>
        {feed && (
          <dl className="mt-10 grid max-w-[640px] grid-cols-3 gap-px overflow-hidden rounded-[12px] border border-hairline bg-hairline">
            <Stat label="open right now" value={feed.count} />
            <Stat label="closing in 3 days" value={closingSoon} />
            <Stat label="today's run cost" value={feed.run ? `$${Number(feed.run.spent_usd).toFixed(3)}` : "—"} />
          </dl>
        )}
      </section>

      <section id="radar" className="scroll-mt-20">
        <div className="lift overflow-hidden rounded-[16px]">
          <div className="flex flex-col gap-3 border-b border-hairline p-4 sm:flex-row sm:items-center">
            <Input placeholder="Filter: meme, thread, design, solana…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter" className="sm:max-w-[360px]" />
            <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex">
              <Select value={source} onChange={setSource} options={SOURCES} label="Source" />
              <Select value={klass} onChange={setKlass} options={CLASSES} label="Class" />
            </div>
          </div>
          {!feed ? (
            <p className="p-10 text-center text-[14px] text-ink-subtle">Loading today's radar…</p>
          ) : items.length === 0 ? (
            <p className="p-10 text-center text-[14px] text-ink-subtle">Nothing matches. Try fewer filters.</p>
          ) : (
            <ItemList items={items} />
          )}
          {feed && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline px-4 py-3 text-[12px] text-ink-subtle">
              <span>Updated {ago(feed.generated_at)} · {items.length} shown</span>
              <span className="flex gap-3">
                <a className="hover:text-ink" href="/feed/latest.json">JSON</a>
                <a className="hover:text-ink" href="/feed/latest.csv">CSV</a>
                <a className="hover:text-ink" href="/feed/latest.xml">RSS</a>
              </span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-surface-1 px-4 py-3.5">
      <dt className="text-[12px] text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 font-mono text-[20px] font-medium tabular-nums tracking-[-0.4px] text-ink">{value}</dd>
    </div>
  );
}

function Select({ value, onChange, options, label }) {
  return (
    <label className="relative min-w-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full min-w-0 appearance-none rounded-[8px] border border-hairline bg-surface-1 pr-8 pl-3 text-[14px] text-ink sm:w-auto"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <svg viewBox="0 0 12 12" className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-ink-subtle" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
    </label>
  );
}

const CLASS_LABEL = { "quick-win": "Quick win", "high-value": "High value", "rail-watch": "Rail watch", standard: "Standard", "manual-review": "Manual review", avoid: "Avoid" };
const SOURCE_LABEL = { x: "X", poidh: "poidh", reddit: "Reddit", github: "GitHub" };

function ItemList({ items }) {
  return <ol className="divide-y divide-hairline">{items.map((i) => <Item key={i.url} i={i} />)}</ol>;
}

function Item({ i }) {
  const days = daysLeft(i.deadline);
  const prize = i.prize_text || (i.payout_amount_usd ? usd(i.payout_amount_usd) : null);
  const good = i.opportunity_class === "quick-win" || i.opportunity_class === "high-value";
  return (
    <li className="group grid grid-cols-[44px_1fr] gap-x-4 gap-y-2 px-4 py-4 transition-colors hover:bg-surface-2 sm:grid-cols-[52px_1fr_150px] sm:px-5">
      <div className="row-span-2 flex flex-col items-center sm:row-span-1">
        <span className={cn("font-mono text-[22px] font-medium tabular-nums tracking-[-0.6px]", i.score >= 70 ? "text-ink" : "text-ink-muted")}>{i.score}</span>
        <span className="text-[11px] text-ink-tertiary">score</span>
      </div>
      <div className="min-w-0">
        <a href={i.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-start gap-1 text-[15px] font-medium leading-[1.4] tracking-[-0.15px] text-ink hover:text-primary-hover">
          <span className="line-clamp-2">{i.title}</span>
          <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-ink-tertiary group-hover:text-ink-subtle" />
        </a>
        {i.task && i.task !== i.title && <p className="mt-1 line-clamp-2 text-[14px] text-ink-subtle">{i.task}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant={good ? "success" : "default"}>{CLASS_LABEL[i.opportunity_class] || i.opportunity_class}</Badge>
          <Badge variant="outline">{SOURCE_LABEL[i.source || "github"]}</Badge>
          {i.kind && i.kind !== "other" && <Badge variant="outline">{i.kind}</Badge>}
          <Badge variant="outline" className="max-w-[220px] truncate">{i.repo}</Badge>
          {i.crowded && <Badge variant="urgent"><Users className="size-3" /> Crowded</Badge>}
          {i.manual_friction && <Badge variant="outline"><ShieldAlert className="size-3" /> Manual steps</Badge>}
        </div>
      </div>
      <div className="col-start-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 sm:col-start-3 sm:flex-col sm:items-end sm:gap-1">
        <span className="font-mono text-[15px] font-medium text-ink">{prize || "Prize unstated"}</span>
        <span className={cn("inline-flex items-center gap-1 text-[12px]", days != null && days <= 2 ? "text-[#ff8a8a]" : "text-ink-subtle")}>
          <Clock className="size-3" />
          {days == null ? "No deadline" : days <= 0 ? "Closes today" : days === 1 ? "1 day left" : `${days} days left`}
        </span>
        <span className="text-[12px] text-ink-tertiary">Effort {i.effort_score}/100</span>
      </div>
    </li>
  );
}

function ScanView({ prefill }) {
  const [address, setAddress] = useState(null);
  const [bal, setBal] = useState(null);
  const [keywords, setKeywords] = useState(prefill || "");
  const [state, setState] = useState({ step: "idle" });

  async function onConnect() {
    try {
      setState({ step: "connecting" });
      const { connect, balances } = await wallet();
      const a = await connect();
      setAddress(a);
      setBal(await balances(a));
      setState({ step: "idle" });
    } catch (e) {
      setState({ step: "error", message: e.shortMessage || e.message });
    }
  }

  async function onScan(e) {
    e.preventDefault();
    if (state.step === "paying") return;
    try {
      setState({ step: "paying" });
      const { payingFetch, balances } = await wallet();
      const f = payingFetch(address, bal);
      const r = await f("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keywords }) });
      const body = await r.json();
      if (!r.ok) {
        const note = body.refunded ? " Your $0.05 was sent back." : body.paymentTx ? " If you were charged and not refunded, contact us with your payment tx." : "";
        throw new Error((body.error || `Scan failed (${r.status})`) + note);
      }
      setState({ step: "done", result: body });
      setBal(await balances(address));
    } catch (e) {
      setState({ step: "error", message: e.shortMessage || e.message });
    }
  }

  // One payment is made in one token, so what matters is the largest single balance.
  const best = bal ? Math.max(bal.USDT.display, bal.USDC.display, bal.USAT.display) : 0;
  const steps = [
    { done: Boolean(address), label: "Connect a wallet on Celo" },
    { done: state.step === "done", label: "Name your niche and sign $0.05" },
    { done: state.step === "done", label: "Get your ranked list in about 40 seconds" },
  ];

  return (
    <section className="grid gap-8 pt-14 pb-10 sm:pt-20 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <p className="eyebrow">Personal scan</p>
        <h1 className="display-md mt-3 max-w-[20ch]">Search right now, for what you make.</h1>
        <p className="mt-4 max-w-[56ch] text-[17px] text-ink-subtle">
          The agent searches X, Reddit and poidh for your keywords, reads every hit and ranks what you can enter. One scan is $0.05 in USD₮, USDC or USA₮, signed in your wallet. You're only charged if results come back; if the paid sources fail, it refunds you.
        </p>

        <ol className="mt-8 grid gap-2">
          {steps.map((s, k) => (
            <li key={k} className="flex items-center gap-3 text-[14px]">
              <span className={cn("flex size-6 items-center justify-center rounded-full border text-[12px]", s.done ? "border-transparent bg-primary text-white" : "border-hairline-strong text-ink-subtle")}>
                {s.done ? <Check className="size-3.5" /> : k + 1}
              </span>
              <span className={s.done ? "text-ink" : "text-ink-subtle"}>{s.label}</span>
            </li>
          ))}
        </ol>

        <div className="mt-8">
          {!address ? (
            <>
              <Button size="lg" onClick={onConnect} disabled={state.step === "connecting"}>
                <Wallet /> {state.step === "connecting" ? "Connecting…" : isMiniPay() ? "Use my MiniPay wallet" : "Connect wallet"}
              </Button>
              {!hasWallet() && <p className="mt-3 text-[13px] text-ink-subtle">Open this page in MiniPay, or in a browser with a wallet extension.</p>}
            </>
          ) : (
            <form onSubmit={onScan} className="grid gap-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input placeholder="e.g. meme OR design OR video" value={keywords} onChange={(e) => setKeywords(e.target.value)} minLength={3} maxLength={80} required aria-label="Keywords" />
                <Button type="submit" size="lg" disabled={state.step === "paying" || keywords.trim().length < 3 || best < 0.05}>
                  {state.step === "paying" ? "Scanning… about 40s" : "Scan · $0.05"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button key={p} type="button" onClick={() => setKeywords((k) => (k ? `${k} OR ${p}` : p))} className="h-8 rounded-full border border-hairline px-3 text-[13px] text-ink-subtle hover:bg-surface-1 hover:text-ink">
                    + {p}
                  </button>
                ))}
              </div>
            </form>
          )}
          {state.step === "error" && <p role="alert" className="mt-4 rounded-[8px] border border-[color-mix(in_srgb,var(--urgent)_35%,transparent)] bg-[color-mix(in_srgb,var(--urgent)_8%,transparent)] px-3 py-2 text-[14px] text-[#ff9b9b]">{state.message}</p>}
        </div>
      </div>

      <Card className="h-fit">
        <CardHeader><CardTitle>Your wallet</CardTitle></CardHeader>
        <CardContent className="text-[14px]">
          {address ? (
            <>
              <p className="font-mono text-[13px] text-ink-subtle">{short(address)}</p>
              <dl className="mt-3 grid grid-cols-2 gap-y-1.5">
                {bal && Object.entries(bal).map(([k, v]) => (
                  <Fragment key={k}>
                    <dt className="text-ink-subtle">{k === "USAT" ? "USA₮" : k === "USDT" ? "USD₮" : k}</dt>
                    <dd className="text-right font-mono tabular-nums">{v.display.toFixed(2)}</dd>
                  </Fragment>
                ))}
              </dl>
              {best < 0.05 && <p className="mt-3 text-[13px] text-[#ff9b9b]">You need $0.05 in one of USD₮, USDC or USA₮ on Celo.</p>}
            </>
          ) : <p className="text-ink-subtle">Not connected</p>}
        </CardContent>
      </Card>

      {state.step === "done" && (
        <div className="lg:col-span-2">
          <p className="mb-3 text-[13px] text-ink-subtle">
            {state.result.items.length} found · you paid {state.result.payment.amount} {state.result.payment.token}
            {state.result.payment.status === "pending" ? " (confirming)" : ""} ·{" "}
            <a className="text-ink-muted underline hover:text-ink" href={`${EXPLORER}/tx/${state.result.payment.tx}`} target="_blank" rel="noreferrer">receipt</a>
            {" "}· the agent spent ${state.result.spentUsd} on data
          </p>
          <div className="lift overflow-hidden rounded-[16px]">
            {state.result.items.length ? <ItemList items={state.result.items} /> : <p className="p-8 text-center text-[14px] text-ink-subtle">Nothing open for those words right now. Try broader ones.</p>}
          </div>
        </div>
      )}
    </section>
  );
}

function AgentView({ feed }) {
  const [ledger, setLedger] = useState(null);
  const [anchors, setAnchors] = useState(null);
  const [onchain, setOnchain] = useState(null);
  useEffect(() => {
    fetch("/feed/ledger.json").then((r) => r.json()).then(setLedger).catch(() => setLedger({ runs: [] }));
    fetch("/feed/anchors.json").then((r) => r.json()).then(setAnchors).catch(() => setAnchors({ anchors: [] }));
    fetch(`${EXPLORER}/api/v2/addresses/${AGENT}/token-transfers?type=ERC-20`).then((r) => r.json()).then((d) => setOnchain(d.items || [])).catch(() => setOnchain([]));
  }, []);

  // Celo fee abstraction adds bookkeeping transfers when gas is paid in USDC: a debit/credit against the
  // zero address and payments to the fee recipients. Those are gas, not income or purchases.
  const ZERO = "0x0000000000000000000000000000000000000000";
  const FEE_SINKS = ["0x4200000000000000000000000000000000000011", "0xcd437749e43a154c07f3553504c68fbfd56b8778"];
  const flows = useMemo(() => {
    const t = onchain || [];
    const val = (x) => Number(x.total?.value || 0) / 10 ** Number(x.total?.decimals || 6);
    const me = AGENT.toLowerCase();
    const from = (x) => x.from?.hash?.toLowerCase();
    const to = (x) => x.to?.hash?.toLowerCase();
    const isGas = (x) => from(x) === ZERO || to(x) === ZERO || FEE_SINKS.includes(to(x));
    const real = t.filter((x) => !isGas(x));
    const paidData = real.filter((x) => from(x) === me && [BUY_PAYTO.toLowerCase(), AGENT402_PAYTO.toLowerCase()].includes(to(x)));
    const gasUsd = t.filter((x) => from(x) === me && FEE_SINKS.includes(to(x))).reduce((s, x) => s + val(x), 0);
    return {
      dataCalls: paidData.length,
      dataUsd: paidData.reduce((s, x) => s + val(x), 0),
      gasUsd,
      earnedUsd: real.filter((x) => to(x) === me && val(x) > 0 && val(x) <= 0.05 + 1e-9).reduce((s, x) => s + val(x), 0),
      rows: real.slice(0, 25),
      val,
    };
  }, [onchain]);

  const label = (x) => {
    const me = AGENT.toLowerCase();
    const out = x.from?.hash?.toLowerCase() === me;
    const cp = (out ? x.to?.hash : x.from?.hash)?.toLowerCase();
    if (out && cp === BUY_PAYTO.toLowerCase()) return "Bought data · buy";
    if (out && cp === AGENT402_PAYTO.toLowerCase()) return "Bought model read · Agent402";
    if (out) return "Sent";
    return val0(x) <= 0.05 + 1e-9 ? "Scan payment received" : "Float top-up";
  };
  const val0 = (x) => Number(x.total?.value || 0) / 10 ** Number(x.total?.decimals || 6);

  return (
    <section className="pt-14 pb-10 sm:pt-20">
      <p className="eyebrow">The agent</p>
      <h1 className="display-md mt-3 max-w-[20ch]">An agent that pays its own way.</h1>
      <p className="mt-4 max-w-[60ch] text-[17px] text-ink-subtle">
        It holds a small USDC float on Celo and owns no data. Every morning it buys X and Reddit searches through buy and one model read through Agent402, publishes the ranked feed, and writes the feed's hash onchain. People and other agents pay it $0.05 per personal scan. Every number here comes from the chain.
      </p>

      <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-[12px] border border-hairline bg-hairline sm:grid-cols-4">
        <Stat label="paid data calls" value={onchain ? flows.dataCalls : "…"} />
        <Stat label="spent on data" value={onchain ? `$${flows.dataUsd.toFixed(3)}` : "…"} />
        <Stat label="earned from scans" value={onchain ? `$${flows.earnedUsd.toFixed(2)}` : "…"} />
        <Stat label="feed anchors" value={anchors ? anchors.anchors.length : "…"} />
      </dl>

      <div className="lift mt-8 overflow-hidden rounded-[16px]">
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4">
          <div>
            <h2 className="text-[15px] font-medium tracking-[-0.2px]">Onchain payments</h2>
            {onchain && <p className="mt-0.5 text-[12px] text-ink-tertiary">Gas is paid in USDC too: ${flows.gasUsd.toFixed(4)} so far, not listed below.</p>}
          </div>
          <a className="inline-flex items-center gap-1 text-[13px] text-ink-subtle hover:text-ink" href={`${EXPLORER}/address/${AGENT}`} target="_blank" rel="noreferrer">
            {short(AGENT)} <ArrowUpRight className="size-3.5" />
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead className="text-left text-[12px] text-ink-tertiary">
              <tr><th className="px-5 py-2.5 font-normal">When</th><th className="py-2.5 pr-4 font-normal">What</th><th className="py-2.5 pr-4 font-normal">Counterparty</th><th className="py-2.5 pr-4 text-right font-normal">Amount</th><th className="py-2.5 pr-5 font-normal">Tx</th></tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {(flows.rows || []).map((x) => {
                const out = x.from?.hash?.toLowerCase() === AGENT.toLowerCase();
                return (
                  <tr key={x.transaction_hash + x.log_index} className="hover:bg-surface-2">
                    <td className="px-5 py-2.5 text-ink-subtle">{ago(x.timestamp)}</td>
                    <td className="py-2.5 pr-4">{label(x)}</td>
                    <td className="py-2.5 pr-4 font-mono text-[12px] text-ink-subtle">{short(out ? x.to?.hash : x.from?.hash)}</td>
                    <td className={cn("py-2.5 pr-4 text-right font-mono tabular-nums", out ? "text-ink-muted" : "text-[#5fd17a]")}>{out ? "−" : "+"}{flows.val(x).toFixed(4)} {x.token?.symbol}</td>
                    <td className="py-2.5 pr-5"><a className="font-mono text-[12px] text-ink-subtle hover:text-ink" href={`${EXPLORER}/tx/${x.transaction_hash}`} target="_blank" rel="noreferrer">{short(x.transaction_hash)}</a></td>
                  </tr>
                );
              })}
              {onchain && onchain.length === 0 && <tr><td colSpan={5} className="px-5 py-4 text-ink-subtle">No transfers yet</td></tr>}
              {!onchain && <tr><td colSpan={5} className="px-5 py-4 text-ink-subtle">Reading Celo…</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Daily runs</CardTitle></CardHeader>
          <CardContent className="text-[13px]">
            {(ledger?.runs || []).slice(0, 7).map((r) => (
              <details key={r.at} className="border-t border-hairline py-2.5">
                <summary className="cursor-pointer text-ink-muted marker:text-ink-tertiary">
                  {r.at.slice(0, 16).replace("T", " ")} UTC · ${Number(r.spent_usd).toFixed(4)} · {r.receipts.filter((x) => x.paid).length} paid calls
                </summary>
                <ul className="mt-2 space-y-1 font-mono text-[12px] text-ink-subtle">
                  {r.receipts.map((x, k) => (
                    <li key={k}>{x.route} · {x.status} · ${x.amountUsd} {x.tx && <a className="hover:text-ink" href={`${EXPLORER}/tx/${x.tx}`} target="_blank" rel="noreferrer">{short(x.tx)}</a>}</li>
                  ))}
                </ul>
              </details>
            ))}
            {ledger && !ledger.runs?.length && <p className="text-ink-subtle">No runs recorded yet.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>For agents</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-[13px] text-ink-subtle">
            <p>Feed: <a className="text-ink-muted hover:text-ink" href="/feed/latest.json">JSON</a> · <a className="text-ink-muted hover:text-ink" href="/feed/latest.csv">CSV</a> · <a className="text-ink-muted hover:text-ink" href="/feed/latest.xml">RSS</a> · <a className="text-ink-muted hover:text-ink" href="/feed/schema.json">schema</a></p>
            <p>Identity: ERC-8004 agent <span className="text-ink-muted">#10034</span> · <a className="text-ink-muted hover:text-ink" href="/agent.json">registration</a> · <a className="text-ink-muted hover:text-ink" href="/.well-known/agent.json">agent card</a> · <a className="text-ink-muted hover:text-ink" href="/llms.txt">llms.txt</a></p>
            <p>Personal scan over x402, $0.05 in USDC, USD₮ or USA₮ on Celo:</p>
            <pre className="overflow-x-auto rounded-[8px] border border-hairline bg-canvas p-3 font-mono text-[12px] leading-[1.6] text-ink-muted">{`buy curl --max-amount 0.05 -X POST \\
  -H 'content-type: application/json' \\
  -d '{"keywords":"meme OR design"}' \\
  ${typeof location !== "undefined" ? location.origin : ""}/api/scan`}</pre>
            <p>MCP: <code className="font-mono text-ink-muted">node scripts/mcp-server.mjs</code> (search_bounties, get_bounty)</p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
