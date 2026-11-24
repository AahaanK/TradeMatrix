import React, { Suspense, lazy } from "react"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { DatasetProvider } from "./hooks/useDataset"
import { AppShell } from "./components/layout/AppShell"
import { LandingPage } from "./features/landing/LandingPage"
import { LoadingState } from "./components/ui/EmptyState"

// Dashboard screens are split into their own bundles so the landing page loads fast.
const page = <T extends Record<string, React.ComponentType>>(loader: () => Promise<T>, name: keyof T) =>
  lazy(() => loader().then(m => ({ default: m[name] as React.ComponentType })))

const OverviewPage = page(() => import("./features/overview/OverviewPage"), "OverviewPage")
const MarketExplorerPage = page(() => import("./features/market/MarketExplorerPage"), "MarketExplorerPage")
const RegimeAnalysisPage = page(() => import("./features/regimes/RegimeAnalysisPage"), "RegimeAnalysisPage")
const StrategyLabPage = page(() => import("./features/strategy/StrategyLabPage"), "StrategyLabPage")
const BacktestResultsPage = page(() => import("./features/backtest/BacktestResultsPage"), "BacktestResultsPage")
const RegimeComparisonPage = page(() => import("./features/comparison/RegimeComparisonPage"), "RegimeComparisonPage")
const RiskAnalyticsPage = page(() => import("./features/risk/RiskAnalyticsPage"), "RiskAnalyticsPage")
const RobustnessLabPage = page(() => import("./features/robustness/RobustnessLabPage"), "RobustnessLabPage")
const OutOfSamplePage = page(() => import("./features/oos/OutOfSamplePage"), "OutOfSamplePage")
const ReplayPage = page(() => import("./features/replay/ReplayPage"), "ReplayPage")
const ExperimentsPage = page(() => import("./features/experiments/ExperimentsPage"), "ExperimentsPage")
const SettingsPage = page(() => import("./features/settings/SettingsPage"), "SettingsPage")

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // The server already retries downloads; don't repeat a failed download from here.
      retry: (count, error) => count < 1 && !/failed to fetch market data|no data returned/i.test((error as Error)?.message ?? ""),
      staleTime: 5 * 60_000,
    },
  },
})

const withSuspense = (el: React.ReactNode) => <Suspense fallback={<LoadingState message="Opening…" />}>{el}</Suspense>

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DatasetProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route element={<AppShell />}>
              <Route path="overview" element={withSuspense(<OverviewPage />)} />
              <Route path="market" element={withSuspense(<MarketExplorerPage />)} />
              <Route path="regimes" element={withSuspense(<RegimeAnalysisPage />)} />
              <Route path="strategy" element={withSuspense(<StrategyLabPage />)} />
              <Route path="backtest" element={withSuspense(<BacktestResultsPage />)} />
              <Route path="comparison" element={withSuspense(<RegimeComparisonPage />)} />
              <Route path="risk" element={withSuspense(<RiskAnalyticsPage />)} />
              <Route path="robustness" element={withSuspense(<RobustnessLabPage />)} />
              <Route path="oos" element={withSuspense(<OutOfSamplePage />)} />
              <Route path="replay" element={withSuspense(<ReplayPage />)} />
              <Route path="experiments" element={withSuspense(<ExperimentsPage />)} />
              <Route path="settings" element={withSuspense(<SettingsPage />)} />
            </Route>
            <Route path="dashboard" element={<Navigate to="/overview" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </DatasetProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
