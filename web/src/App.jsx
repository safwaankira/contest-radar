import { Fragment, useEffect, useMemo, useState } from "react";
import { Radar, Search, Wallet, Bot, ExternalLink, Clock, Users, ShieldAlert } from "lucide-react";
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
  { id: "radar", label: "radar", icon: Radar },
  { id: "scan", label: "my scan", icon: Search },
  { id: "agent", label: "the agent", icon: Bot },
];
const SOURCES = ["all", "x", "poidh", "reddit", "github"];
const CLASSES = ["all", "quick-win", "high-value", "rail-watch", "standard", "manual-review"];

export default function App() {
  const [tab, setTab] = useState(() => (location.hash.slice(1) || "radar"));
  useEffect(() => { location.hash = tab; }, [tab]);
  const [feed, setFeed] = useState(null);
  useEffect(() => { fetch("/feed/latest.json").then((r) => r.json()).then(setFeed).catch(() => setFeed({ items: [], errors: [{ message: "feed unavailable" }] })); }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b py-6">
        <div>
          <a href="#radar" onClick={() => setTab("radar")} className="font-mono text-lg font-semibold tracking-tight">contest radar</a>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Open crypto contests and bounties worth your time, read and ranked every day by an agent that pays for its own data on Celo.
          </p>
        </div>
        <nav className="flex gap-1" aria-label="sections">
          {TABS.map(({ id, label, icon: Icon }) => (
            <Button key={id} variant={tab === id ? "default" : "ghost"} size="sm" onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}>
              <Icon /> {label}
            </Button>
          ))}
        </nav>
      </header>
      {tab === "radar" && <RadarView feed={feed} />}
      {tab === "scan" && <ScanView />}
      {tab === "agent" && <AgentView feed={feed} />}
      <footer className="mt-16 border-t pt-6 font-mono text-xs text-muted-foreground">
        built on <a className="underline" href="https://github.com/go165/bounty-radar">go165/bounty-radar</a> · data bought through{" "}
        <a className="underline" href="https://usebuy.ai">buy</a> on Celo · agent{" "}
        <a className="underline" href={`${EXPLORER}/address/${AGENT}`}>{short(AGENT)}</a> ·{" "}
        <a className="underline" href="https://github.com/safwaankira/contest-radar">source</a>
      </footer>
    </div>
  );
}

function RadarView({ feed }) {
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

  if (!feed) return <p className="py-10 font-mono text-sm text-muted-foreground">loading the radar…</p>;
  return (
    <section className="py-6">
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-xs text-muted-foreground">
        <span>updated {ago(feed.generated_at)}</span>
        <span>{feed.count} open</span>
        {feed.run && <span>last run cost ${feed.run.spent_usd?.toFixed?.(3) ?? feed.run.spent_usd}</span>}
      </div>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row">
        <Input placeholder="filter: meme, thread, design, solana…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="filter" />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Select value={source} onChange={setSource} options={SOURCES} label="source" />
          <Select value={klass} onChange={setKlass} options={CLASSES} label="class" />
        </div>
      </div>
      {items.length === 0 ? <p className="py-10 text-center font-mono text-sm text-muted-foreground">nothing matches. try fewer filters.</p> : <ItemList items={items} />}
    </section>
  );
}

function Select({ value, onChange, options, label }) {
  return (
    <label className="flex min-w-0 items-center gap-2 font-mono text-xs text-muted-foreground">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 min-w-0 flex-1 rounded-[var(--radius)] border bg-background px-2 font-mono text-sm text-foreground">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function ItemList({ items }) {
  return (
    <ol className="divide-y border-y">
      {items.map((i) => <Item key={i.url} i={i} />)}
    </ol>
  );
}

function Item({ i }) {
  const days = daysLeft(i.deadline);
  const prize = i.prize_text || (i.payout_amount_usd ? usd(i.payout_amount_usd) : null);
  return (
    <li className="grid grid-cols-[3rem_1fr] gap-3 py-4 sm:grid-cols-[3.5rem_1fr_auto]">
      <div className="flex flex-col items-center">
        <span className={cn("font-mono text-xl font-semibold tabular-nums", i.score >= 70 ? "text-primary" : "")}>{i.score}</span>
        <span className="font-mono text-[10px] text-muted-foreground">score</span>
      </div>
      <div className="min-w-0">
        <a href={i.url} target="_blank" rel="noreferrer" className="group inline-flex items-start gap-1 font-medium leading-snug hover:underline">
          <span className="line-clamp-2">{i.title}</span>
          <ExternalLink className="mt-1 size-3 shrink-0 opacity-50 group-hover:opacity-100" />
        </a>
        {i.task && i.task !== i.title && <p className="mt-1 text-sm text-muted-foreground">{i.task}</p>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge variant={i.opportunity_class === "quick-win" || i.opportunity_class === "high-value" ? "accent" : "default"}>{i.opportunity_class}</Badge>
          <Badge>{i.source || "github"}</Badge>
          {i.kind && i.kind !== "other" && <Badge>{i.kind}</Badge>}
          <Badge>{i.repo}</Badge>
          {i.crowded && <Badge variant="danger"><Users className="size-3" /> crowded</Badge>}
          {i.manual_friction && <Badge variant="danger"><ShieldAlert className="size-3" /> manual steps</Badge>}
        </div>
      </div>
      <div className="col-start-2 flex gap-4 font-mono text-sm sm:col-start-3 sm:flex-col sm:items-end sm:gap-1">
        <span className="font-semibold">{prize || "prize ?"}</span>
        <span className={cn("inline-flex items-center gap-1 text-xs", days != null && days <= 2 ? "text-destructive" : "text-muted-foreground")}>
          <Clock className="size-3" />
          {days == null ? "no deadline" : days <= 0 ? "closes today" : `${days}d left`}
        </span>
        <span className="text-xs text-muted-foreground">effort {i.effort_score}/100</span>
      </div>
    </li>
  );
}

function ScanView() {
  const [address, setAddress] = useState(null);
  const [bal, setBal] = useState(null);
  const [keywords, setKeywords] = useState("");
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
    try {
      setState({ step: "paying" });
      const { payingFetch, balances } = await wallet();
      const f = payingFetch(address, bal);
      const r = await f("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keywords }) });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || `scan failed (${r.status})`);
      setState({ step: "done", result: body });
      setBal(await balances(address));
    } catch (e) {
      setState({ step: "error", message: e.shortMessage || e.message });
    }
  }

  const total = bal ? bal.USDT.display + bal.USDC.display + bal.USAT.display : 0;
  return (
    <section className="grid gap-6 py-6 lg:grid-cols-[1fr_18rem]">
      <div>
        <h2 className="font-mono text-base font-semibold">scan for your niche</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tell the agent what you make. It searches X, Reddit and poidh right now, reads every hit and ranks what you can enter. One scan costs $0.05, signed in your wallet, and you are only charged if results come back.
        </p>
        {!address ? (
          <div className="mt-5">
            <Button onClick={onConnect} disabled={state.step === "connecting"}><Wallet /> {state.step === "connecting" ? "connecting…" : isMiniPay() ? "use MiniPay wallet" : "connect wallet"}</Button>
            {!hasWallet() && <p className="mt-2 font-mono text-xs text-muted-foreground">open this page in MiniPay or a browser with a wallet.</p>}
          </div>
        ) : (
          <form onSubmit={onScan} className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Input placeholder="e.g. meme OR design OR video" value={keywords} onChange={(e) => setKeywords(e.target.value)} minLength={3} maxLength={80} required aria-label="keywords" />
            <Button type="submit" variant="accent" disabled={state.step === "paying" || keywords.trim().length < 3 || total < 0.05}>
              {state.step === "paying" ? "scanning… (~40s)" : "scan · $0.05"}
            </Button>
          </form>
        )}
        {state.step === "error" && <p role="alert" className="mt-3 font-mono text-sm text-destructive">{state.message}</p>}
        {state.step === "done" && (
          <div className="mt-6">
            <p className="mb-2 font-mono text-xs text-muted-foreground">
              {state.result.items.length} found · you paid {state.result.payment.amount} {state.result.payment.token} ·{" "}
              <a className="underline" href={`${EXPLORER}/tx/${state.result.payment.tx}`} target="_blank" rel="noreferrer">receipt</a> · the agent spent ${state.result.spentUsd} on data
            </p>
            {state.result.items.length ? <ItemList items={state.result.items} /> : <p className="font-mono text-sm">nothing open for those words right now. try broader ones.</p>}
          </div>
        )}
      </div>
      <Card className="h-fit">
        <CardHeader><CardTitle>your wallet</CardTitle></CardHeader>
        <CardContent className="font-mono text-sm">
          {address ? (
            <>
              <p className="text-muted-foreground">{short(address)}</p>
              <dl className="mt-2 grid grid-cols-2 gap-y-1">
                {bal && Object.entries(bal).map(([k, v]) => (<Fragment key={k}><dt className="text-muted-foreground">{k === "USAT" ? "USA₮" : k === "USDT" ? "USD₮" : k}</dt><dd className="text-right tabular-nums">{v.display.toFixed(2)}</dd></Fragment>))}
              </dl>
              {total < 0.05 && <p className="mt-3 text-xs text-destructive">you need $0.05 in USD₮, USDC or USA₮ on Celo.</p>}
            </>
          ) : <p className="text-muted-foreground">not connected</p>}
        </CardContent>
      </Card>
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

  const flows = useMemo(() => {
    const t = onchain || [];
    const val = (x) => Number(x.total?.value || 0) / 10 ** Number(x.total?.decimals || 6);
    const out = t.filter((x) => x.from?.hash?.toLowerCase() === AGENT.toLowerCase());
    const inn = t.filter((x) => x.to?.hash?.toLowerCase() === AGENT.toLowerCase());
    const toBuy = out.filter((x) => x.to?.hash?.toLowerCase() === BUY_PAYTO.toLowerCase());
    const payers = new Set(inn.map((x) => x.from?.hash?.toLowerCase()));
    return { spent: out.reduce((s, x) => s + val(x), 0), toBuy: toBuy.length, earned: inn.filter((x) => x.method === "transferWithAuthorization" || x.type === "token_transfer").reduce((s, x) => s + val(x), 0), payers: payers.size, rows: t.slice(0, 25), val };
  }, [onchain]);

  return (
    <section className="grid gap-6 py-6">
      <div>
        <h2 className="font-mono text-base font-semibold">an agent that pays its own way</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          The agent holds a small USDC float on Celo. Every day it buys X and Reddit searches through buy and one model call through Agent402, then publishes the ranked feed and writes its hash onchain. People and other agents pay it $0.05 per personal scan. Every payment below is on Celo and checkable.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="agent wallet" value={short(AGENT)} href={`${EXPLORER}/address/${AGENT}`} />
        <Stat label="paid calls to buy" value={onchain ? flows.toBuy : "…"} />
        <Stat label="spent on data + gas" value={onchain ? `$${flows.spent.toFixed(3)}` : "…"} />
        <Stat label="feed anchors onchain" value={anchors ? anchors.anchors.length : "…"} />
      </div>
      <Card>
        <CardHeader><CardTitle>onchain payments, newest first</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead className="text-left text-muted-foreground"><tr><th className="py-1 pr-3 font-normal">when</th><th className="pr-3 font-normal">direction</th><th className="pr-3 font-normal">counterparty</th><th className="pr-3 text-right font-normal">amount</th><th className="font-normal">tx</th></tr></thead>
            <tbody>
              {(flows.rows || []).map((x) => {
                const out = x.from?.hash?.toLowerCase() === AGENT.toLowerCase();
                const cp = out ? x.to?.hash : x.from?.hash;
                return (
                  <tr key={x.transaction_hash + x.log_index} className="border-t">
                    <td className="py-1.5 pr-3">{ago(x.timestamp)}</td>
                    <td className="pr-3">{out ? (cp?.toLowerCase() === BUY_PAYTO.toLowerCase() ? "paid buy" : "paid") : "received"}</td>
                    <td className="pr-3">{short(cp)}</td>
                    <td className="pr-3 text-right tabular-nums">{flows.val(x).toFixed(4)} {x.token?.symbol}</td>
                    <td><a className="underline" href={`${EXPLORER}/tx/${x.transaction_hash}`} target="_blank" rel="noreferrer">{short(x.transaction_hash)}</a></td>
                  </tr>
                );
              })}
              {onchain && onchain.length === 0 && <tr><td colSpan={5} className="py-3 text-muted-foreground">no transfers yet</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>daily runs</CardTitle></CardHeader>
          <CardContent className="font-mono text-xs">
            {(ledger?.runs || []).slice(0, 7).map((r) => (
              <details key={r.at} className="border-t py-2">
                <summary className="cursor-pointer">{r.at.slice(0, 16).replace("T", " ")} · ${Number(r.spent_usd).toFixed(4)} · {r.receipts.filter((x) => x.paid).length} paid calls</summary>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  {r.receipts.map((x, k) => (
                    <li key={k}>{x.route} · {x.status} · ${x.amountUsd} {x.tx && <a className="underline" href={`${EXPLORER}/tx/${x.tx}`} target="_blank" rel="noreferrer">{short(x.tx)}</a>}</li>
                  ))}
                </ul>
              </details>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>for agents</CardTitle></CardHeader>
          <CardContent className="space-y-2 font-mono text-xs">
            <p>feed: <a className="underline" href="/feed/latest.json">json</a> · <a className="underline" href="/feed/latest.csv">csv</a> · <a className="underline" href="/feed/latest.xml">rss</a> · <a className="underline" href="/feed/schema.json">schema</a></p>
            <p>agent card: <a className="underline" href="/.well-known/agent.json">/.well-known/agent.json</a> · <a className="underline" href="/llms.txt">llms.txt</a> · <a className="underline" href="/agent.json">ERC-8004 registration</a></p>
            <p>personal scan over x402 ($0.05 in USDC, USD₮ or USA₮ on Celo):</p>
            <pre className="overflow-x-auto rounded-[var(--radius)] bg-muted p-2">{`buy curl --max-amount 0.05 -X POST \\
  -H 'content-type: application/json' \\
  -d '{"keywords":"meme OR design"}' \\
  ${location.origin}/api/scan`}</pre>
            <p>mcp: <code>npx contest-radar-mcp</code> (search_bounties, get_bounty)</p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function Stat({ label, value, href }) {
  const v = <span className="font-mono text-lg font-semibold tabular-nums">{value}</span>;
  return (
    <Card className="p-3">
      <p className="font-mono text-[11px] text-muted-foreground">{label}</p>
      {href ? <a href={href} target="_blank" rel="noreferrer" className="hover:underline">{v}</a> : v}
    </Card>
  );
}
