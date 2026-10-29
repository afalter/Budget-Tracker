import { useState, useEffect, useCallback, useRef } from "react";
import type { Account, ActualSpend, IncomeSource, IncomingTransfer, PlannedExpense, Override, DateRange, ProjectionDay, CategoryColor } from "./types";
import * as api from "./api";
import DateRangeBar from "./components/DateRangeBar";
import ProjectionChart from "./components/ProjectionChart";
import SpendingPieChart from "./components/SpendingPieChart";
import IncomeExpenseBarChart from "./components/IncomeExpenseBarChart";
import CashFlowChart from "./components/CashFlowChart";
import ExpenseTrendChart from "./components/ExpenseTrendChart";
import LedgerView from "./components/LedgerView";
import IncomeList from "./components/IncomeList";
import ExpenseList from "./components/ExpenseList";
import SetBalanceModal from "./components/SetBalanceModal";
import AccountManageModal from "./components/AccountManageModal";
import CategoryManageModal from "./components/CategoryManageModal";
import ActualSpendList from "./components/ActualSpendList";
import HelpPanel, { HelpButton } from "./components/HelpPanel";
import type { HelpTopic } from "./components/HelpPanel";
import ChartFullscreen from "./components/ChartFullscreen";
import SpreadsheetControls from "./components/SpreadsheetControls";
import type { ChartType } from "./types";

const CHART_OPTIONS: { value: ChartType; label: string }[] = [
  { value: "projection", label: "Projection" },
  { value: "spending", label: "Spending by Category" },
  { value: "income-vs-expenses", label: "Income vs Expenses" },
  { value: "cash-flow", label: "Cash Flow" },
  { value: "expense-trend", label: "Expense Trends" },
];

type ViewMode = "chart" | "ledger";

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);
}

export default function App() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [showAccountModal, setShowAccountModal] = useState(false);

  const [balance, setBalance] = useState<number | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [income, setIncome] = useState<IncomeSource[]>([]);
  const [incomingTransfers, setIncomingTransfers] = useState<IncomingTransfer[]>([]);
  const [expenses, setExpenses] = useState<PlannedExpense[]>([]);
  const [actuals, setActuals] = useState<ActualSpend[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("chart");
  const [chartType, setChartType] = useState<ChartType>("projection");
  const [dateRange, setDateRange] = useState<DateRange>({ kind: "preset", days: 90 });
  const [categories, setCategories] = useState<CategoryColor[]>([]);
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpTopic, setHelpTopic] = useState<HelpTopic>("getting-started");
  const [fullscreenChart, setFullscreenChart] = useState<ChartType | null>(null);
  const [projections, setProjections] = useState<ProjectionDay[]>([]);
  const [projectionsLoading, setProjectionsLoading] = useState(false);
  const [projectionError, setProjectionError] = useState<string | null>(null);
  const projectionRequestId = useRef(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Load accounts on mount
  const fetchAccounts = useCallback(async () => {
    const accs = await api.getAccounts();
    setAccounts(accs);
    return accs;
  }, []);

  useEffect(() => {
    fetchAccounts().then((accs) => {
      if (accs.length === 0) return;
      const saved = localStorage.getItem("activeAccountId");
      const valid = accs.find((a) => a.id === saved);
      setActiveAccountId(valid ? valid.id : accs[0].id);
    });
  }, [fetchAccounts]);

  // Fetch all data for the active account
  const fetchAll = useCallback(async () => {
    if (!activeAccountId) return;
    setLoading(true);
    try {
      const [balRes, incRes, transfersRes, expRes, actualsRes, colorsRes] = await Promise.all([
        api.getBalance(activeAccountId),
        api.getIncome(activeAccountId),
        api.getIncomingTransfers(activeAccountId),
        api.getExpenses(activeAccountId),
        api.getActuals(activeAccountId),
        api.getCategories(),
      ]);

      if (balRes) {
        setBalance(balRes.amount);
        setBalanceError(null);
      } else {
        setBalance(null);
        setBalanceError(null);
        setShowBalanceModal(true);
      }

      setIncome(incRes);
      setIncomingTransfers(transfersRes);
      setExpenses(expRes);
      setActuals(actualsRes);

      setCategories(colorsRes);
      const colorMap: Record<string, string> = {};
      for (const c of colorsRes) {
        colorMap[c.name] = c.color;
      }
      setCategoryColors(colorMap);
    } catch (err) {
      if (err instanceof api.ApiError && err.status === 503 && err.code === "OCCURRENCE_PROCESSING_FAILED") {
        setBalance(null);
        setBalanceError("Balance update failed. Please try again.");
      }
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId]);

  // Fetch projections for the active account
  const fetchProjections = useCallback(async () => {
    if (!activeAccountId) return;
    const requestId = ++projectionRequestId.current;
    setProjectionsLoading(true);
    setProjections([]);
    setProjectionError(null);
    setFullscreenChart(null);
    try {
      const activeOverrides = overrides.length > 0 ? overrides : undefined;
      const range =
        dateRange.kind === "preset"
          ? { days: dateRange.days }
          : { startDate: dateRange.startDate, endDate: dateRange.endDate };
      const result = await api.getProjections(activeAccountId, range, activeOverrides);
      if (requestId !== projectionRequestId.current) return;
      setProjections(result);
    } catch (err) {
      if (requestId !== projectionRequestId.current) return;
      if (err instanceof api.ApiError && err.status === 409 && err.code === "NO_HISTORICAL_SNAPSHOT") {
        setProjectionError("No matching balance snapshot exists for this period.");
      } else if (err instanceof api.ApiError && err.status === 409 && err.code === "NO_BALANCE_SNAPSHOT") {
        setProjectionError("Please set a current balance first.");
      } else if (err instanceof api.ApiError && err.status === 503 && err.code === "OCCURRENCE_PROCESSING_FAILED") {
        setProjectionError("Due transactions could not be processed. Please try again.");
      } else {
        setProjectionError("Projections could not be loaded.");
      }
      console.error("Failed to fetch projections:", err);
    } finally {
      if (requestId === projectionRequestId.current) {
        setProjectionsLoading(false);
      }
    }
  }, [activeAccountId, dateRange, overrides, refreshKey]);

  useEffect(() => {
    if (activeAccountId) {
      setOverrides([]);
      fetchAll();
    }
  }, [activeAccountId, fetchAll]);

  useEffect(() => {
    fetchProjections();
  }, [fetchProjections]);

  function handleAccountChange(id: string) {
    setActiveAccountId(id);
    localStorage.setItem("activeAccountId", id);
  }

  async function handleSaveBalance(amount: number) {
    if (!activeAccountId) return;
    await api.setBalance(activeAccountId, amount);
    setBalance(amount);
    setShowBalanceModal(false);
    refresh();
  }

  function handleIncomeRefresh() {
    if (!activeAccountId) return;
    api.getIncome(activeAccountId).then(setIncome).catch(console.error);
    refresh();
  }

  function handleExpenseRefresh() {
    if (!activeAccountId) return;
    api.getExpenses(activeAccountId).then(setExpenses).catch(console.error);
    refresh();
  }

  function handleActualsRefresh() {
    if (!activeAccountId) return;
    api.getActuals(activeAccountId).then(setActuals).catch(console.error);
    api.getBalance(activeAccountId)
      .then((result) => setBalance(result ? result.amount : null))
      .catch(console.error);
    refresh();
  }

  function handleTransactionRefresh() {
    if (!activeAccountId) return;
    api.getBalance(activeAccountId)
      .then((result) => setBalance(result ? result.amount : null))
      .catch(console.error);
    refresh();
  }

  async function handleCategoryColorChange(name: string, color: string) {
    setCategoryColors((prev) => ({ ...prev, [name]: color }));
    await api.updateCategory(name, { color });
  }

  async function handleCategoriesChange() {
    const cats = await api.getCategories();
    setCategories(cats);
    const colorMap: Record<string, string> = {};
    for (const c of cats) {
      colorMap[c.name] = c.color;
    }
    setCategoryColors(colorMap);
    // Refresh expenses since category names may have changed
    if (activeAccountId) {
      api.getExpenses(activeAccountId).then(setExpenses).catch(console.error);
    }
  }

  function openHelp(topic: HelpTopic) {
    setHelpTopic(topic);
    setShowHelp(true);
  }

  function handleToggleOverride(id: string, active: boolean, type: "income" | "expense") {
    setOverrides((prev) => {
      const filtered = prev.filter((o) => o.id !== id);
      return [...filtered, { id, type, active }];
    });
  }

  function renderChart() {
    if (projectionError) {
      return <div className="alert alert-warning">{projectionError}</div>;
    }
    if (projectionsLoading && projections.length === 0) {
      return (
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body items-center justify-center h-[430px]">
            <span className="loading loading-spinner loading-lg" />
          </div>
        </div>
      );
    }

    let chart: React.ReactNode;
    switch (chartType) {
      case "projection":
        chart = <ProjectionChart projections={projections} categoryColors={categoryColors} />;
        break;
      case "spending":
        chart = <SpendingPieChart projections={projections} categoryColors={categoryColors} />;
        break;
      case "income-vs-expenses":
        chart = <IncomeExpenseBarChart projections={projections} />;
        break;
      case "cash-flow":
        chart = <CashFlowChart projections={projections} />;
        break;
      case "expense-trend":
        chart = <ExpenseTrendChart projections={projections} categoryColors={categoryColors} />;
        break;
    }

    return (
      <div className="relative group">
        {chart}
        <button
          className="btn btn-ghost btn-sm btn-circle absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-opacity"
          onClick={() => setFullscreenChart(chartType)}
          title="Expand chart"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
          </svg>
        </button>
      </div>
    );
  }

  if (loading || !activeAccountId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  const activeAccount = accounts.find((a) => a.id === activeAccountId);

  return (
    <div className="min-h-screen bg-base-200">
      {/* Navbar */}
      <div className="navbar bg-base-100 shadow-lg sticky top-0 z-50">
        <div className="navbar-start">
          <h1 className="text-xl font-bold px-4">Budget Tracker</h1>
          <button
            className="btn btn-ghost btn-sm btn-circle"
            onClick={() => openHelp("getting-started")}
            aria-label="Help"
            title="Help"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
            </svg>
          </button>
        </div>
        <div className="navbar-center">
          <div className="flex items-center gap-2">
            <select
              className="select select-bordered select-sm"
              value={activeAccountId}
              onChange={(e) => handleAccountChange(e.target.value)}
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
            <button
              className="btn btn-ghost btn-xs"
              onClick={() => setShowAccountModal(true)}
            >
              Manage
            </button>
          </div>
        </div>
        <div className="navbar-end px-4 gap-2">
          <SpreadsheetControls accountId={activeAccountId} onImportComplete={fetchAll} />
          <button
            className="btn btn-ghost"
            onClick={() => setShowBalanceModal(true)}
            aria-label="Set balance"
          >
            <div className="stat p-0">
              <div className="stat-title text-xs">Balance</div>
              <div
                className={`stat-value text-lg ${
                  balance !== null && balance >= 0 ? "text-success" : "text-error"
                }`}
              >
                {balance !== null ? formatCurrency(balance) : "--"}
              </div>
            </div>
          </button>
        </div>
      </div>

      {balanceError && (
        <div className="alert alert-warning mx-6 mt-4">
          {balanceError}
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto p-4 max-w-6xl space-y-6">
        {/* Controls bar: view toggle + chart type + date range */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex items-center gap-2 shrink-0">
            <div className="tabs tabs-boxed w-fit">
              <button
                className={`tab ${viewMode === "chart" ? "tab-active" : ""}`}
                onClick={() => setViewMode("chart")}
              >
                Charts
              </button>
              <button
                className={`tab ${viewMode === "ledger" ? "tab-active" : ""}`}
                onClick={() => setViewMode("ledger")}
              >
                Ledger
              </button>
              <HelpButton topic={viewMode === "chart" ? "charts" : "ledger"} onClick={openHelp} />
            </div>

            {viewMode === "chart" && (
              <select
                className="select select-bordered select-sm"
                value={chartType}
                onChange={(e) => setChartType(e.target.value as ChartType)}
              >
                {CHART_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <DateRangeBar value={dateRange} onChange={setDateRange} />
        </div>

        {/* Chart or Ledger */}
        {projectionError ? (
          <div className="alert alert-warning">{projectionError}</div>
        ) : viewMode === "chart" ? (
          renderChart()
        ) : (
          <LedgerView
            projections={projections}
            dateRange={dateRange}
            loading={projectionsLoading}
            accountId={activeAccountId}
            onRefresh={handleTransactionRefresh}
          />
        )}

        {/* Income and Expenses Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <IncomeList
            accountId={activeAccountId}
            items={income}
            incomingTransfers={incomingTransfers}
            onRefresh={handleIncomeRefresh}
            onToggleOverride={(id, active) =>
              handleToggleOverride(id, active, "income")
            }
            onHelp={() => openHelp("income")}
          />
          <ExpenseList
            accountId={activeAccountId}
            accounts={accounts}
            categories={categories}
            items={expenses}
            onRefresh={handleExpenseRefresh}
            onToggleOverride={(id, active) =>
              handleToggleOverride(id, active, "expense")
            }
            categoryColors={categoryColors}
            onCategoryColorChange={handleCategoryColorChange}
            onManageCategories={() => setShowCategoryModal(true)}
            onHelp={() => openHelp("expenses")}
          />
        </div>

        {/* Actual Spending */}
        <ActualSpendList
          accountId={activeAccountId}
          items={actuals}
          expenses={expenses}
          categories={categories}
          onRefresh={handleActualsRefresh}
          onHelp={() => openHelp("actual-spending")}
        />
      </main>

      {/* Balance Modal */}
      <SetBalanceModal
        open={showBalanceModal}
        currentBalance={balance}
        onSave={handleSaveBalance}
        onClose={() => setShowBalanceModal(false)}
      />

      {/* Account Management Modal */}
      <AccountManageModal
        open={showAccountModal}
        accounts={accounts}
        activeAccountId={activeAccountId}
        onClose={() => setShowAccountModal(false)}
        onAccountsChange={() => fetchAccounts()}
        onActiveAccountChange={handleAccountChange}
      />

      <CategoryManageModal
        open={showCategoryModal}
        categories={categories}
        onClose={() => setShowCategoryModal(false)}
        onCategoriesChange={handleCategoriesChange}
      />

      <HelpPanel
        open={showHelp}
        topic={helpTopic}
        onClose={() => setShowHelp(false)}
        onChangeTopic={setHelpTopic}
      />

      <ChartFullscreen
        open={fullscreenChart !== null && !projectionError}
        chartType={fullscreenChart ?? "projection"}
        projections={projections}
        categoryColors={categoryColors}
        onClose={() => setFullscreenChart(null)}
      />
    </div>
  );
}
