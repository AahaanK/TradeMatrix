import React, { useEffect, useState } from "react"
import { Link, NavLink, Outlet, useLocation } from "react-router-dom"
import {
  BarChart3,
  CandlestickChart,
  Clock3,
  FlaskConical,
  Gauge,
  History,
  LayoutDashboard,
  Menu,
  Moon,
  Scale,
  Settings,
  ShieldAlert,
  SlidersHorizontal,
  Split,
  Sun,
  Waves,
  X,
} from "lucide-react"
import { useDataset } from "../../hooks/useDataset"
import { Logo } from "../brand/Logo"
import { Select, type SelectOption } from "../ui/Select"
import { Switch } from "../ui/Controls"
import { IconButton, Button } from "../ui/Button"
import { InfoTip } from "../ui/InfoTip"
import { cn } from "../../utils/cn"

type NavItem = { path: string; label: string; icon: React.ComponentType<{ className?: string }> }

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Explore",
    items: [
      { path: "/overview", label: "Overview", icon: LayoutDashboard },
      { path: "/market", label: "Market Explorer", icon: CandlestickChart },
      { path: "/regimes", label: "Market Conditions", icon: Waves },
    ],
  },
  {
    label: "Test a strategy",
    items: [
      { path: "/strategy", label: "Strategy Testing", icon: FlaskConical },
      { path: "/backtest", label: "Backtest Results", icon: BarChart3 },
      { path: "/comparison", label: "Compare by Condition", icon: Scale },
    ],
  },
  {
    label: "Check the results",
    items: [
      { path: "/risk", label: "Risk Analysis", icon: ShieldAlert },
      { path: "/robustness", label: "Parameter Stability", icon: SlidersHorizontal },
      { path: "/oos", label: "Out-of-Sample Test", icon: Split },
      { path: "/replay", label: "Time Replay", icon: Clock3 },
    ],
  },
  {
    label: "Your work",
    items: [
      { path: "/experiments", label: "Research History", icon: History },
      { path: "/settings", label: "Settings", icon: Settings },
    ],
  },
]

export const TICKER_OPTIONS: SelectOption[] = [
  { value: "SPY", label: "SPY", description: "S&P 500 fund. Built-in data, works offline", meta: "Built-in", group: "Built-in" },
  { value: "QQQ", label: "QQQ", description: "Nasdaq-100 fund", meta: "Online", group: "Downloaded from Yahoo Finance" },
  { value: "IWM", label: "IWM", description: "Russell 2000 small companies", meta: "Online", group: "Downloaded from Yahoo Finance" },
  { value: "DIA", label: "DIA", description: "Dow Jones 30 fund", meta: "Online", group: "Downloaded from Yahoo Finance" },
  { value: "GLD", label: "GLD", description: "Gold", meta: "Online", group: "Downloaded from Yahoo Finance" },
  { value: "TLT", label: "TLT", description: "Long-term US government bonds", meta: "Online", group: "Downloaded from Yahoo Finance" },
]

export const AppShell: React.FC = () => {
  const { ticker, setTicker, adjusted, setAdjusted, theme, toggleTheme } = useDataset()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setDrawerOpen(false)
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [drawerOpen])

  const tickerOptions = TICKER_OPTIONS.some(o => o.value === ticker)
    ? TICKER_OPTIONS
    : [{ value: ticker, label: ticker, description: "Your custom symbol", meta: "Online", group: "Custom" }, ...TICKER_OPTIONS]

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-pop"
      >
        Skip to content
      </a>

      {/* Sidebar: fixed on desktop, drawer on smaller screens */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-sapphire/40 transition-opacity lg:hidden",
          drawerOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col bg-nav text-white transition-transform duration-200 lg:translate-x-0",
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
        aria-label="Main navigation"
      >
        <div className="flex h-14 items-center justify-between px-4">
          <Link to="/" className="text-white no-underline" aria-label="TradeMatrix home">
            <Logo size={26} wordmarkClassName="text-white text-[16px]" />
          </Link>
          <IconButton label="Close menu" className="text-white/70 hover:bg-white/10 hover:text-white lg:hidden" onClick={() => setDrawerOpen(false)}>
            <X />
          </IconButton>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 pb-4 pt-2">
          {NAV_GROUPS.map(group => (
            <div key={group.label} className="mb-4">
              <div className="px-2.5 pb-1.5 text-xs font-medium text-white/45">{group.label}</div>
              <ul className="space-y-px">
                {group.items.map(item => {
                  const Icon = item.icon
                  return (
                    <li key={item.path}>
                      <NavLink
                        to={{ pathname: item.path, search: location.search }}
                        className={({ isActive }) =>
                          cn(
                            "group relative flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm no-underline transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-scooter/70",
                            isActive
                              ? "bg-white/[0.09] font-medium text-white before:absolute before:inset-y-2 before:-left-2.5 before:w-[3px] before:rounded-r before:bg-scooter"
                              : "text-white/70 hover:bg-white/[0.05] hover:text-white"
                          )
                        }
                      >
                        <Icon className="size-4 shrink-0 opacity-80" />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 px-4 py-3 text-xs leading-5 text-white/55">
          <div className="flex items-center gap-1.5 text-white/75">
            <Gauge className="size-3.5" aria-hidden="true" />
            {ticker === "SPY" ? "Built-in SPY data, 2014–2023" : `${ticker} from Yahoo Finance`}
          </div>
          <div>{ticker === "SPY" ? "Works without internet" : "Needs an internet connection"}</div>
        </div>
      </aside>

      <div className="lg:pl-[248px]">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-line bg-canvas">
          <div className="mx-auto flex h-14 max-w-page items-center gap-3 px-4 sm:px-6">
            <IconButton label="Open menu" className="-ml-1.5 lg:hidden" onClick={() => setDrawerOpen(true)}>
              <Menu />
            </IconButton>

            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-ink-2 sm:inline">Asset</span>
              <Select
                ariaLabel="Choose the asset to analyse"
                value={ticker}
                onChange={setTicker}
                options={tickerOptions}
                searchable
                searchPlaceholder="Search or type a symbol"
                onCreate={q => setTicker(q)}
                normalizeQuery={q => q.trim().toUpperCase().replace(/[^A-Z0-9.^=-]/g, "").slice(0, 12)}
                createLabel={q => `Use ${q} (download from Yahoo Finance)`}
                size="sm"
                className="w-[104px]"
                menuClassName="w-80"
                renderValue={o => <span className="font-semibold">{o?.label ?? ticker}</span>}
              />
            </div>

            <div className="hidden items-center gap-1.5 md:flex">
              <Switch checked={adjusted} onChange={setAdjusted} label="Adjust for dividends and splits" labelClassName="text-sm text-ink-2" />
              <InfoTip label="Adjusted prices">
                Adjusted prices add back dividends and remove the jumps caused by stock splits, so returns reflect what an investor
                actually earned. Leave this on unless you need the raw traded prices.
              </InfoTip>
            </div>

            <div className="ml-auto flex items-center gap-1">
              <Link to="/" className="hidden h-9 items-center rounded-md px-2.5 text-sm text-ink-2 no-underline hover:bg-subtle hover:text-ink sm:inline-flex">
                About
              </Link>
              <IconButton label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} onClick={toggleTheme}>
                {theme === "dark" ? <Sun /> : <Moon />}
              </IconButton>
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto max-w-page px-4 pb-12 pt-6 sm:px-6 sm:pt-8">
          <Outlet />
        </main>

        <footer className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-4 text-xs text-ink-3 sm:px-6">
          <span>For research and learning. Past results do not predict future returns and nothing here is investment advice.</span>
          <span>
            Charts by{" "}
            <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noreferrer" className="text-ink-2 underline-offset-2 hover:underline">
              TradingView Lightweight Charts
            </a>
          </span>
        </footer>
      </div>
    </div>
  )
}

/** Offered inside error states when a downloaded ticker fails. */
export const UseBuiltInDataButton: React.FC = () => {
  const { ticker, setTicker } = useDataset()
  if (ticker === "SPY") return null
  return (
    <Button onClick={() => setTicker("SPY")}>Switch to built-in SPY data</Button>
  )
}
