import React, { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  BarChart3,
  Clock3,
  FlaskConical,
  History,
  Menu,
  Moon,
  Scale,
  ShieldAlert,
  SlidersHorizontal,
  Split,
  Sun,
  Waves,
  X,
} from "lucide-react"
import { Logo } from "../../components/brand/Logo"
import { ButtonLink, IconButton } from "../../components/ui/Button"
import { useDataset } from "../../hooks/useDataset"
import { HistoryRibbon } from "./HistoryRibbon"
import history from "./spyHistory.json"
import { formatInt, formatPercent } from "../../utils/format"
import { cn } from "../../utils/cn"

const FEATURES = [
  {
    icon: Waves,
    title: "See what kind of market it was",
    body: "Every day is labelled as a calm or volatile uptrend or downtrend, using only prices known at the time.",
    to: "/regimes",
    link: "Market Conditions",
  },
  {
    icon: FlaskConical,
    title: "Test four classic strategies",
    body: "Momentum, mean reversion, moving-average crossover and buy and hold, each with settings explained in plain words.",
    to: "/strategy",
    link: "Strategy Testing",
  },
  {
    icon: BarChart3,
    title: "Read results you can act on",
    body: "Account value, worst drops, monthly returns and every trade, always compared with simply buying and holding.",
    to: "/backtest",
    link: "Backtest Results",
  },
  {
    icon: Scale,
    title: "Match strategies to conditions",
    body: "A side-by-side table of how each strategy did in each market condition, with small samples clearly flagged.",
    to: "/comparison",
    link: "Compare by Condition",
  },
  {
    icon: ShieldAlert,
    title: "Know the downside",
    body: "Bad-day losses, the longest stretch below a high, behaviour in the 2020 crash and 2022 sell-off, and the cost level where profits disappear.",
    to: "/risk",
    link: "Risk Analysis",
  },
  {
    icon: SlidersHorizontal,
    title: "Check the settings aren't a fluke",
    body: "Scan a grid of settings to see whether the best result sits on a broad plateau or a lone spike.",
    to: "/robustness",
    link: "Parameter Stability",
  },
  {
    icon: Split,
    title: "Test on years it has never seen",
    body: "Pick settings on older data, then measure them on newer data. Rolling walk-forward tests repeat this several times.",
    to: "/oos",
    link: "Out-of-Sample Test",
  },
  {
    icon: Clock3,
    title: "Replay any day in history",
    body: "Scrub through time and see exactly what the strategy held and knew on a given date, with the future hidden.",
    to: "/replay",
    link: "Time Replay",
  },
  {
    icon: History,
    title: "Keep a record",
    body: "Save runs with their exact settings and a data fingerprint, compare up to four, and export PDF reports or CSV files.",
    to: "/experiments",
    link: "Research History",
  },
]

const STEPS = [
  {
    title: "Look at the market",
    body: "Open the built-in ten years of S&P 500 prices, or type any symbol to download it. Check the data and see which conditions the market went through.",
  },
  {
    title: "Describe a strategy",
    body: "Choose a rule set and adjust it with sliders. A sentence under the form spells out exactly what the rule will do, and costs are set before you run.",
  },
  {
    title: "Run the backtest",
    body: "The strategy is replayed day by day. Each decision uses the closing price, the trade happens at the next close, and costs come off every trade.",
  },
  {
    title: "Try to break it",
    body: "Look at the risk, nudge the settings, and test on unseen years. A strategy worth trusting survives all three; most don't, and that is useful to know.",
  },
]

const SAFEGUARDS = [
  {
    title: "No peeking at the future",
    body: "Signals are calculated from data up to the close of each day, and positions start the next day. Market conditions use only history known at the time, never the full dataset.",
  },
  {
    title: "Costs are never optional",
    body: "Every trade pays commission and slippage. You can see the result before and after costs, and the exact cost level where the strategy stops making money.",
  },
  {
    title: "Tuning is tested, not trusted",
    body: "The settings scan and out-of-sample test exist to catch results that only worked on the data they were tuned on, the most common reason backtests disappoint.",
  },
]

const Screenshot: React.FC<{ name: string; alt: string; className?: string; priority?: boolean }> = ({ name, alt, className, priority }) => {
  const { theme } = useDataset()
  return (
    <img
      src={`/screens/${name}-${theme}.png`}
      alt={alt}
      width={1600}
      height={1000}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={cn("block h-auto w-full rounded-lg border border-line bg-surface", className)}
    />
  )
}

export const LandingPage: React.FC = () => {
  const { theme, toggleTheme } = useDataset()
  const [menuOpen, setMenuOpen] = useState(false)
  const bh = history.buyHold

  useEffect(() => {
    document.title = "TradeMatrix: test trading strategies on real market history"
  }, [])

  const navLinks = [
    { href: "#features", label: "What you can do" },
    { href: "#how", label: "How it works" },
    { href: "#safeguards", label: "Avoiding false results" },
  ]

  return (
    <div className="min-h-screen overflow-x-clip bg-canvas text-ink">
      <a href="#top" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded focus:bg-surface focus:px-3 focus:py-2 focus:text-sm">
        Skip to content
      </a>

      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-line bg-canvas">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-5 sm:px-8">
          <Link to="/" className="text-ink no-underline" aria-label="TradeMatrix home">
            <Logo />
          </Link>
          <nav aria-label="Page sections" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {navLinks.map(l => (
                <li key={l.href}>
                  <a href={l.href} className="rounded-md px-3 py-2 text-sm text-ink-2 no-underline transition-colors hover:bg-subtle hover:text-ink">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <IconButton label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={toggleTheme}>
              {theme === "dark" ? <Sun /> : <Moon />}
            </IconButton>
            <ButtonLink to="/overview" variant="primary" className="hidden sm:inline-flex">
              Open dashboard
            </ButtonLink>
            <IconButton label={menuOpen ? "Close menu" : "Open menu"} className="md:hidden" onClick={() => setMenuOpen(o => !o)} aria-expanded={menuOpen}>
              {menuOpen ? <X /> : <Menu />}
            </IconButton>
          </div>
        </div>
        {menuOpen && (
          <nav aria-label="Page sections" className="border-t border-line px-5 py-3 md:hidden">
            <ul className="space-y-1">
              {navLinks.map(l => (
                <li key={l.href}>
                  <a href={l.href} onClick={() => setMenuOpen(false)} className="block rounded-md px-3 py-2 text-base text-ink no-underline hover:bg-subtle">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <ButtonLink to="/overview" variant="primary" className="mt-3 w-full">
              Open dashboard
            </ButtonLink>
          </nav>
        )}
      </header>

      <main id="top">
        {/* Hero */}
        <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 pb-16 pt-14 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:pb-20 lg:pt-20">
          <div className="max-w-xl">
            <h1 className="text-[36px] font-semibold leading-[1.1] tracking-[-0.025em] sm:text-[44px] sm:leading-[1.08]">
              Find out if a trading strategy really works, before you rely on it.
            </h1>
            <p className="mt-5 text-md leading-7 text-ink-2 sm:text-lg sm:leading-8">
              TradeMatrix tests your rules on ten years of S&amp;P 500 prices, takes off realistic trading costs, and shows how the
              results change when markets are calm or stressed. Everything is explained in plain English.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink to="/overview" variant="primary" size="lg">
                Open dashboard
              </ButtonLink>
              <a href="#how" className="inline-flex h-11 items-center px-2 text-[15px] font-medium text-ink no-underline hover:text-brand">
                See how it works
              </a>
            </div>
            <p className="mt-6 text-sm text-ink-3">Free and open source. No account needed. The built-in data works offline.</p>
          </div>
          <div className="lg:-mr-24 xl:-mr-40">
            <Screenshot name="overview" alt="The TradeMatrix overview screen, showing SPY's price coloured by market condition and summary figures" priority />
          </div>
        </section>

        {/* Signature: the real ten-year history */}
        <section className="border-y border-line bg-surface" aria-labelledby="ten-years">
          <div className="mx-auto max-w-[1200px] px-5 py-14 sm:px-8">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-end">
              <h2 id="ten-years" className="text-2xl font-semibold tracking-[-0.015em]">
                Ten years of the S&amp;P 500, and four very different markets inside them.
              </h2>
              <p className="text-base text-ink-2">
                This is the real built-in dataset: {formatInt(history.bars)} trading days of SPY. Buy and hold grew{" "}
                <span className="num font-medium text-ink">{formatPercent(bh.cagr, false, 1)}</span> a year, but fell{" "}
                <span className="num font-medium text-ink">{formatPercent(Math.abs(bh.maxDrawdown), false, 1)}</span> at its worst in 2020.
                The colours show how TradeMatrix classified each stretch. Hover to explore.
              </p>
            </div>
            <div className="mt-8">
              <HistoryRibbon />
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-20 sm:px-8" aria-labelledby="features-title">
          <div className="max-w-2xl">
            <h2 id="features-title" className="text-3xl font-semibold tracking-[-0.02em]">What you can do</h2>
            <p className="mt-3 text-md text-ink-2">
              Each part of the dashboard answers one question a careful investor would ask before trusting a strategy.
            </p>
          </div>
          <ul className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(f => {
              const Icon = f.icon
              return (
                <li key={f.title} className="border-t border-line pt-5">
                  <Icon className="size-5 text-brand" aria-hidden="true" />
                  <h3 className="mt-3 text-md font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-6 text-ink-2">{f.body}</p>
                  <Link to={f.to} className="mt-3 inline-block text-sm font-medium no-underline hover:underline">
                    Open {f.link}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        {/* Screens */}
        <section className="bg-subtle" aria-labelledby="screens-title">
          <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8">
            <h2 id="screens-title" className="sr-only">Screens from the dashboard</h2>
            <div className="grid gap-10 lg:grid-cols-2">
              <figure className="m-0">
                <Screenshot name="backtest" alt="Backtest results: a plain-language summary, key figures and the account value chart compared with buy and hold" />
                <figcaption className="mt-3 text-sm text-ink-2">
                  <span className="font-medium text-ink">Backtest results.</span> A one-paragraph summary comes first, then the numbers, then every trade.
                </figcaption>
              </figure>
              <figure className="m-0">
                <Screenshot name="robustness" alt="Parameter stability grid with Sharpe ratios for each combination of settings" />
                <figcaption className="mt-3 text-sm text-ink-2">
                  <span className="font-medium text-ink">Parameter stability.</span> One bright cell surrounded by weak ones is a warning, not a discovery.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-20 sm:px-8" aria-labelledby="how-title">
          <h2 id="how-title" className="text-3xl font-semibold tracking-[-0.02em]">How it works</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="num flex size-8 items-center justify-center rounded-full bg-sapphire text-sm font-semibold text-alabaster dark:bg-scooter dark:text-sapphire">
                    {i + 1}
                  </span>
                  <span className="hidden h-px flex-1 bg-line-strong/70 lg:block" aria-hidden="true" />
                </div>
                <h3 className="mt-4 text-md font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-ink-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Safeguards */}
        <section id="safeguards" className="scroll-mt-20 border-t border-line" aria-labelledby="safeguards-title">
          <div className="mx-auto grid max-w-[1200px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
            <div>
              <h2 id="safeguards-title" className="text-3xl font-semibold tracking-[-0.02em]">Built to avoid false results</h2>
              <p className="mt-3 text-md text-ink-2">
                Most backtests look better than reality for three reasons. TradeMatrix is designed around all three.
              </p>
            </div>
            <dl className="grid gap-8 sm:grid-cols-3">
              {SAFEGUARDS.map(s => (
                <div key={s.title}>
                  <dt className="text-md font-semibold">{s.title}</dt>
                  <dd className="mt-2 text-sm leading-6 text-ink-2">{s.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="bg-sapphire text-alabaster">
          <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-6 px-5 py-14 sm:px-8 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-[-0.015em] text-alabaster">Start with the built-in data. It takes a minute.</h2>
              <p className="mt-2 text-base text-heather">Open the dashboard, pick a strategy, and run your first backtest.</p>
            </div>
            <Link
              to="/overview"
              className="inline-flex h-11 items-center rounded-md bg-alabaster px-5 text-[15px] font-medium text-sapphire no-underline shadow-[0_1px_1px_rgb(0_0_0/0.2)] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-scooter focus-visible:ring-offset-2 focus-visible:ring-offset-sapphire"
            >
              Open dashboard
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-12 sm:px-8 md:grid-cols-[minmax(0,1.3fr)_repeat(2,minmax(0,1fr))]">
          <div>
            <Logo size={24} />
            <p className="mt-3 max-w-sm text-sm text-ink-2">
              A research tool for testing trading strategies on historical data. It is for learning and research only and is not
              investment advice. Past results do not predict future returns.
            </p>
          </div>
          <nav aria-label="Dashboard">
            <h2 className="text-sm font-semibold">Dashboard</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                ["/overview", "Overview"],
                ["/market", "Market Explorer"],
                ["/strategy", "Strategy Testing"],
                ["/risk", "Risk Analysis"],
                ["/experiments", "Research History"],
              ].map(([to, label]) => (
                <li key={to}>
                  <Link to={to} className="text-ink-2 no-underline hover:text-ink">{label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <h2 className="text-sm font-semibold">Credits</h2>
            <ul className="mt-3 space-y-2 text-sm text-ink-2">
              <li>
                Price charts by{" "}
                <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer" className="text-ink-2 underline underline-offset-2 hover:text-ink">
                  TradingView Lightweight Charts
                </a>
              </li>
              <li>Other charts by Recharts</li>
              <li>Typeface: IBM Plex, SIL Open Font License</li>
              <li>Online prices from Yahoo Finance via yfinance</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line">
          <p className="mx-auto max-w-[1200px] px-5 py-4 text-xs text-ink-3 sm:px-8">TradeMatrix is released under the MIT License.</p>
        </div>
      </footer>
    </div>
  )
}
