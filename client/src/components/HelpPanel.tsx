import { useState } from "react";

export type HelpTopic =
  | "getting-started"
  | "accounts"
  | "income"
  | "expenses"
  | "transfers"
  | "actual-spending"
  | "charts"
  | "ledger"
  | "categories"
  | "spreadsheet"
  | "tips";

interface Props {
  open: boolean;
  topic?: HelpTopic;
  onClose: () => void;
  onChangeTopic: (topic: HelpTopic) => void;
}

const TOPICS: { id: HelpTopic; title: string; icon: string }[] = [
  { id: "getting-started", title: "Getting Started", icon: "rocket" },
  { id: "accounts", title: "Accounts", icon: "bank" },
  { id: "income", title: "Forecast Income", icon: "income" },
  { id: "expenses", title: "Forecast Expenses", icon: "expenses" },
  { id: "transfers", title: "Transfers", icon: "transfer" },
  { id: "actual-spending", title: "Actual Spending", icon: "actual" },
  { id: "charts", title: "Charts", icon: "chart" },
  { id: "ledger", title: "Ledger", icon: "ledger" },
  { id: "categories", title: "Categories", icon: "category" },
  { id: "spreadsheet", title: "Spreadsheet Exchange", icon: "spreadsheet" },
  { id: "tips", title: "Tips & Workflows", icon: "tips" },
];

function TopicIcon({ icon }: { icon: string }) {
  const cls = "w-4 h-4 opacity-60";
  switch (icon) {
    case "rocket": return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09zM12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>;
    case "bank": return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3"/></svg>;
    case "income": return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2v20M17 7l-5-5-5 5"/></svg>;
    case "expenses": return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 2v20M7 17l5 5 5-5"/></svg>;
    case "transfer": return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>;
    case "actual": return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>;
    case "chart": return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 20V10M12 20V4M6 20v-6"/></svg>;
    case "ledger": return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18"/></svg>;
    case "category": return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/></svg>;
    case "spreadsheet": return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h2M8 17h2M12 13h4M12 17h4"/></svg>;
    case "tips": return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z"/></svg>;
    default: return null;
  }
}

function Link({ topic, children, onClick }: { topic: HelpTopic; children: React.ReactNode; onClick: (t: HelpTopic) => void }) {
  return (
    <button className="link link-primary text-sm" onClick={() => onClick(topic)}>
      {children}
    </button>
  );
}

function TopicContent({ topic, onNavigate }: { topic: HelpTopic; onNavigate: (t: HelpTopic) => void }) {
  switch (topic) {
    case "getting-started":
      return (
        <div className="space-y-3">
          <p>Welcome to Budget Tracker! Here's how to get started:</p>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li><strong>Set your balance</strong> -- Click the balance display in the top right to enter your current account balance. This is the starting point for all projections.</li>
            <li><strong>Add income</strong> -- In the Forecast Income panel, click "+ Add" to create income sources. Set the name, amount, how often it recurs, and when it starts.</li>
            <li><strong>Add expenses</strong> -- In the Forecast Expenses panel, click "+ Add" to create planned expenses. Assign categories to organize your spending.</li>
            <li><strong>Read the chart</strong> -- The Projection chart shows your balance trajectory over time. Green means above zero, red means below.</li>
            <li><strong>Try what-if</strong> -- Toggle income or expenses on/off with the switches to see how changes affect your future balance.</li>
          </ol>
          <div className="bg-base-200 rounded-lg p-3 text-sm">
            <strong>Tip:</strong> Start with your regular monthly income and biggest expenses (rent, utilities, subscriptions). You can always add more later.
          </div>
          <p className="text-sm">Next: <Link topic="accounts" onClick={onNavigate}>Managing Accounts</Link> | <Link topic="income" onClick={onNavigate}>Adding Income</Link> | <Link topic="expenses" onClick={onNavigate}>Adding Expenses</Link></p>
        </div>
      );

    case "accounts":
      return (
        <div className="space-y-3">
          <p>Budget Tracker supports multiple accounts (checking, savings, etc.).</p>
          <h4 className="font-semibold text-sm">Switching Accounts</h4>
          <p className="text-sm">Use the dropdown in the center of the navbar to switch between accounts. All data (income, expenses, balance, charts) updates to show the selected account.</p>
          <h4 className="font-semibold text-sm">Managing Accounts</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Click <strong>Manage</strong> next to the account dropdown</li>
            <li><strong>Create:</strong> Type a name and click "Add Account"</li>
            <li><strong>Rename:</strong> Click "Rename", edit the name, press "Save"</li>
            <li><strong>Delete:</strong> Click "Delete" and confirm. All data in that account is permanently removed. You cannot delete your last account.</li>
          </ol>
          <div className="bg-base-200 rounded-lg p-3 text-sm">
            <strong>Note:</strong> Your selected account is remembered across page reloads. Each account's data is completely independent.
          </div>
          <p className="text-sm">Related: <Link topic="transfers" onClick={onNavigate}>Transfers Between Accounts</Link></p>
        </div>
      );

    case "income":
      return (
        <div className="space-y-3">
          <p>Income sources represent money coming into your account on a regular schedule.</p>
          <h4 className="font-semibold text-sm">Adding Income</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Click <strong>+ Add</strong> in the Forecast Income panel</li>
            <li>Enter a name (e.g., "Salary"), the amount, how often it recurs (weekly, monthly, etc.), and the start date</li>
            <li>Click "Add" to save</li>
          </ol>
          <h4 className="font-semibold text-sm">Intervals</h4>
          <table className="table table-xs">
            <tbody>
              <tr><td className="font-mono">One Time</td><td>Fires once on the start date</td></tr>
              <tr><td className="font-mono">Daily</td><td>Every day from the start date</td></tr>
              <tr><td className="font-mono">Weekly</td><td>Every 7 days</td></tr>
              <tr><td className="font-mono">Biweekly</td><td>Every 14 days</td></tr>
              <tr><td className="font-mono">Monthly</td><td>Same day each month</td></tr>
              <tr><td className="font-mono">Bimonthly</td><td>Every 2 calendar months</td></tr>
              <tr><td className="font-mono">Quarterly</td><td>Every 3 months</td></tr>
              <tr><td className="font-mono">Yearly</td><td>Same date each year</td></tr>
            </tbody>
          </table>
          <h4 className="font-semibold text-sm">Toggling & What-If</h4>
          <p className="text-sm">Use the toggle switch to temporarily disable an income source. The projection updates instantly. This is saved to the database (unlike expense overrides in the chart).</p>
          <h4 className="font-semibold text-sm">Incoming Transfers</h4>
          <p className="text-sm">If another account has a transfer targeting this account, it appears as read-only income grouped under "Transfer from [Account]".</p>
          <h4 className="font-semibold text-sm">Collapsed Summary</h4>
          <p className="text-sm">Click the title to collapse. The summary shows total income for the <strong>current calendar month</strong>, calculated based on how many times each item fires this month.</p>
        </div>
      );

    case "expenses":
      return (
        <div className="space-y-3">
          <p>Planned expenses represent money going out of your account.</p>
          <h4 className="font-semibold text-sm">Adding an Expense</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Click <strong>+ Add</strong> in the Forecast Expenses panel</li>
            <li>Enter name, amount, interval, and start date</li>
            <li>Optionally set an <strong>end date</strong> (when the expense stops repeating)</li>
            <li>Choose a <strong>category</strong> using the category picker</li>
            <li>Toggle <strong>Variable price</strong> if the amount changes over time</li>
            <li>Toggle <strong>Transfer</strong> to mark it as a transfer to another account</li>
          </ol>
          <h4 className="font-semibold text-sm">Categories</h4>
          <p className="text-sm">Expenses are grouped by category with color-coded headers. Click <Link topic="categories" onClick={onNavigate}>Categories</Link> to manage them.</p>
          <h4 className="font-semibold text-sm">Variable Pricing</h4>
          <p className="text-sm">For expenses whose amount changes (e.g., rent increases), enable "Variable price", then use the "Prices" button to add dated price adjustments.</p>
          <h4 className="font-semibold text-sm">Collapsed Summary</h4>
          <p className="text-sm">Click the title to collapse. Shows total expenses for the <strong>current calendar month</strong>.</p>
          <p className="text-sm">Related: <Link topic="actual-spending" onClick={onNavigate}>Actual Spending</Link> | <Link topic="transfers" onClick={onNavigate}>Transfers</Link></p>
        </div>
      );

    case "transfers":
      return (
        <div className="space-y-3">
          <p>Transfers move money between your accounts. A transfer is an expense in the source account that appears as income in the target.</p>
          <h4 className="font-semibold text-sm">Setting Up a Transfer</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>In the source account, click <strong>+ Add</strong> in Forecast Expenses</li>
            <li>Enable <strong>"Transfer to another account"</strong></li>
            <li>Select the target account from the dropdown</li>
            <li>Set the amount and schedule as usual</li>
          </ol>
          <h4 className="font-semibold text-sm">How It Appears</h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><strong>Source account:</strong> Shows as an expense grouped under "Transfer To [Account]"</li>
            <li><strong>Target account:</strong> Shows as read-only income under "Transfer from [Account]". In projections, events are named "[TransferName]-[Month]"</li>
          </ul>
          <h4 className="font-semibold text-sm">Transfers and Charts</h4>
          <p className="text-sm">Transfers appear in the <strong>Projection chart</strong> and <strong>Ledger</strong> (they affect your balance), but are excluded from spending analysis charts (Spending by Category, Income vs Expenses, Cash Flow, Expense Trends) since they are not real spending.</p>
          <div className="bg-base-200 rounded-lg p-3 text-sm">
            <strong>Note:</strong> Transfers can only be edited from the source account. They appear as read-only in the target.
          </div>
        </div>
      );

    case "actual-spending":
      return (
        <div className="space-y-3">
          <p>Track what you <strong>actually</strong> spent versus what you forecasted. When an actual is linked to a forecast expense, the projection uses the real amount instead.</p>
          <h4 className="font-semibold text-sm">Adding an Actual</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Expand the <strong>Actual Spending</strong> panel (amber colored)</li>
            <li>Click <strong>+ Add</strong></li>
            <li>Enter the date and amount of the real transaction</li>
            <li>Optionally <strong>link to a forecast</strong> -- select the planned expense this actual corresponds to. The category auto-fills from the linked forecast.</li>
            <li>Add a note for context (e.g., "Double breakfast Monday")</li>
          </ol>
          <h4 className="font-semibold text-sm">How Linking Works</h4>
          <p className="text-sm">When an actual is linked to a forecast expense and falls on a day that expense would fire:</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>The <strong>actual amount</strong> is used instead of the forecast</li>
            <li>Future dates without actuals still use the forecast</li>
            <li>Example: Forecast $30/week for breakfast. Record actual $60 on Monday. Chart shows $60 that week, $30 next week.</li>
          </ul>
          <h4 className="font-semibold text-sm">Visual Indicators</h4>
          <p className="text-sm">Actual events appear in <span className="text-warning font-semibold">amber</span> with an "actual" badge in the chart tooltip and ledger view.</p>
        </div>
      );

    case "charts":
      return (
        <div className="space-y-3">
          <p>Five chart types visualize your financial data. Switch between them with the dropdown next to the Charts/Ledger tabs.</p>
          <h4 className="font-semibold text-sm">Projection</h4>
          <p className="text-sm">Area chart showing your balance day-by-day. The line color reflects the dominant expense category. Green gradient when above zero, red when below. Hover for daily details. Actual spending events appear in amber.</p>
          <h4 className="font-semibold text-sm">Spending by Category</h4>
          <p className="text-sm">Donut chart breaking down total expenses by category. Sorted by amount. Hover for percentages. Transfers between accounts are excluded.</p>
          <h4 className="font-semibold text-sm">Income vs Expenses</h4>
          <p className="text-sm">Monthly grouped bars. Green = income, red = expenses (excluding transfers). Hover to see net.</p>
          <h4 className="font-semibold text-sm">Cash Flow</h4>
          <p className="text-sm">Monthly net bars. Green = surplus, red = deficit (transfers excluded from expenses). Shows cumulative total.</p>
          <h4 className="font-semibold text-sm">Expense Trends</h4>
          <p className="text-sm">Stacked area chart showing weekly spending by category over time. Smooths daily noise to show patterns. Transfers excluded.</p>
          <div className="bg-base-200 rounded-lg p-3 text-sm">
            <strong>Note:</strong> Transfers between your accounts are not real spending, so they only appear in the Projection chart and Ledger (where they affect your balance), not in the spending analysis charts above.
          </div>
          <h4 className="font-semibold text-sm">Fullscreen Mode</h4>
          <p className="text-sm">Hover over any chart and click the expand icon in the top-right corner to open the chart in fullscreen. The chart fills the entire screen with a toolbar and zoom controls.</p>
          <h4 className="font-semibold text-sm">Zoom Select</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>In fullscreen, click <strong>Zoom Select</strong> in the toolbar</li>
            <li>Click a point on the chart to set the start of the range</li>
            <li>Click another point to set the end</li>
            <li>The chart zooms to show only that range with full detail</li>
          </ol>
          <h4 className="font-semibold text-sm">Range Sliders</h4>
          <p className="text-sm">Two sliders at the bottom of fullscreen let you drag the start and end points of the visible range. Date labels update as you drag.</p>
          <h4 className="font-semibold text-sm">Chart Controls</h4>
          <p className="text-sm">The fullscreen toolbar includes chart-specific toggles:</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><strong>Projection:</strong> Area / Line -- switch between filled area and line only</li>
            <li><strong>Income vs Expenses:</strong> Grouped / Stacked -- side-by-side or stacked bars</li>
            <li><strong>Spending by Category:</strong> Donut / Full Pie -- ring or solid pie</li>
            <li><strong>Expense Trends:</strong> Stacked / Individual -- stacked areas or separate lines</li>
          </ul>
          <div className="bg-base-200 rounded-lg p-3 text-sm">
            <strong>Tip:</strong> Press Escape to step back: first cancels zoom select, then resets zoom, then closes fullscreen.
          </div>
          <h4 className="font-semibold text-sm">Date Range</h4>
          <p className="text-sm">Use the preset buttons (30d, 60d, 90d, 6mo, 1yr) or click "Custom" for manual date selection. All charts respond to the selected range.</p>
        </div>
      );

    case "ledger":
      return (
        <div className="space-y-3">
          <p>The Ledger view shows a day-by-day transaction table with running balance.</p>
          <h4 className="font-semibold text-sm">Summary Stats</h4>
          <p className="text-sm">Four cards at the top: Total Income, Total Expenses, Net Cash Flow, and Ending Balance for the selected date range.</p>
          <h4 className="font-semibold text-sm">Filters</h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><strong>All Days:</strong> Every day, even those with no events</li>
            <li><strong>Events Only:</strong> Only days with income or expense events</li>
            <li><strong>Income / Expenses:</strong> Show only that type</li>
          </ul>
          <h4 className="font-semibold text-sm">Search</h4>
          <p className="text-sm">Type in the search box to filter by transaction name.</p>
          <h4 className="font-semibold text-sm">Reading the Table</h4>
          <p className="text-sm">Dates appear once per group. Income in green, expenses in red. Actual spending entries show an <span className="text-warning font-semibold">amber</span> dot with an "actual" badge. Rows with negative balance have a subtle red background.</p>
        </div>
      );

    case "categories":
      return (
        <div className="space-y-3">
          <p>Categories organize your expenses and appear in charts with custom colors.</p>
          <h4 className="font-semibold text-sm">Assigning Categories</h4>
          <p className="text-sm">When adding or editing an expense, click the category field to open the picker. Search existing categories or create a new one.</p>
          <h4 className="font-semibold text-sm">Managing Categories</h4>
          <ol className="list-decimal list-inside space-y-1 text-sm">
            <li>Click <strong>Categories</strong> in the Forecast Expenses panel header</li>
            <li><strong>Edit:</strong> Change name, color, or description</li>
            <li><strong>Delete:</strong> Removes the category. Expenses using it become uncategorized.</li>
            <li><strong>Add new:</strong> Enter name, pick a color, add an optional description</li>
          </ol>
          <div className="bg-base-200 rounded-lg p-3 text-sm">
            <strong>Note:</strong> Renaming a category automatically updates all expenses that use it. Categories are shared across all accounts.
          </div>
          <h4 className="font-semibold text-sm">Quick Color Change</h4>
          <p className="text-sm">Click the color dot on any category header in the expense list to change its color without opening the manager.</p>
        </div>
      );

    case "spreadsheet":
      return (
        <div className="space-y-3">
          <p>Export your account data to Excel for bulk editing, then import it back.</p>
          <h4 className="font-semibold text-sm">Exporting</h4>
          <p className="text-sm">Click the <strong>Export</strong> button in the navbar. Downloads an .xlsx file for the <strong>currently selected account</strong> with 7 sheets: Instructions, Balance, Income, Expenses, Price Adjustments, Actual Spending, and Category Colors.</p>
          <h4 className="font-semibold text-sm">Editing Rules</h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><strong>Edit:</strong> Change values in a row, keep the ID column intact</li>
            <li><strong>Add:</strong> Add a row at the bottom, leave the ID column blank</li>
            <li><strong>Delete:</strong> Remove the entire row</li>
          </ul>
          <h4 className="font-semibold text-sm">Importing</h4>
          <p className="text-sm">Click <strong>Import</strong> and select a modified .xlsx file. The system matches rows by ID: existing rows update, new rows create, missing rows delete. A toast shows the results.</p>
          <div className="bg-base-200 rounded-lg p-3 text-sm">
            <strong>Tip:</strong> Always export first to get the latest data and correct format. Back up before making large changes.
          </div>
        </div>
      );

    case "tips":
      return (
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">What-If Analysis</h4>
          <p className="text-sm">Toggle income or expense switches to temporarily remove items from the projection. The chart updates instantly. Toggle changes are saved to the database.</p>
          <h4 className="font-semibold text-sm">Date Range Tips</h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li>Use <strong>30d</strong> for day-to-day tracking</li>
            <li>Use <strong>90d</strong> for quarterly planning</li>
            <li>Use <strong>1yr</strong> for long-term projections</li>
            <li>Use <strong>Custom</strong> to zoom into a specific period</li>
          </ul>
          <h4 className="font-semibold text-sm">Common Workflows</h4>
          <ul className="list-disc list-inside space-y-1 text-sm">
            <li><strong>Monthly review:</strong> Set 30d range, compare Income vs Expenses chart</li>
            <li><strong>Paycheck planning:</strong> Set date range to your next pay period, check the Projection chart for dips</li>
            <li><strong>Saving goals:</strong> Create a Savings account, set up a transfer from checking, watch the Savings projection grow</li>
            <li><strong>Track vs. forecast:</strong> Record actuals in the Actual Spending panel, compare amber (actual) vs red (forecast) events in the chart</li>
            <li><strong>Variable bills:</strong> Mark expenses as variable, add price adjustments as bills change</li>
            <li><strong>Deep analysis:</strong> Expand a chart to fullscreen, use Zoom Select to drill into a specific week or pay period, use the Area/Line toggle to see the trend more clearly</li>
          </ul>
          <h4 className="font-semibold text-sm">Fullscreen Charts</h4>
          <p className="text-sm">Hover over any chart and click the expand icon for a full-window view. Use <strong>Zoom Select</strong> to click two points and drill in, or drag the <strong>range sliders</strong> at the bottom. Each chart has its own toggle controls (Area/Line, Grouped/Stacked, etc.). See <Link topic="charts" onClick={onNavigate}>Charts</Link> for details.</p>
          <h4 className="font-semibold text-sm">Collapsible Panels</h4>
          <p className="text-sm">Click panel titles to collapse/expand. Collapsed panels show current-month totals so you always have context.</p>
        </div>
      );
  }
}

export default function HelpPanel({ open, topic, onClose, onChangeTopic }: Props) {
  const [activeTopic, setActiveTopic] = useState<HelpTopic>(topic || "getting-started");

  function handleNavigate(t: HelpTopic) {
    setActiveTopic(t);
    onChangeTopic(t);
  }

  if (!open) return null;

  const activeTopicMeta = TOPICS.find((t) => t.id === activeTopic);

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-2xl max-h-[80vh] p-0 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-base-content/10 shrink-0">
          <h3 className="font-bold text-lg">Help</h3>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>Close</button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <nav className="w-48 shrink-0 border-r border-base-content/10 overflow-y-auto bg-base-200/50 py-2">
            {TOPICS.map((t) => (
              <button
                key={t.id}
                className={`flex items-center gap-2 w-full px-3 py-2 text-left text-sm transition-colors ${
                  activeTopic === t.id ? "bg-primary/10 text-primary font-semibold" : "hover:bg-base-200"
                }`}
                onClick={() => handleNavigate(t.id)}
              >
                <TopicIcon icon={t.icon} />
                {t.title}
              </button>
            ))}
          </nav>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-lg font-bold mb-3">{activeTopicMeta?.title}</h3>
            <div className="prose prose-sm max-w-none">
              <TopicContent topic={activeTopic} onNavigate={handleNavigate} />
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </dialog>
  );
}

// Small help button component for contextual placement
export function HelpButton({
  topic,
  onClick,
}: {
  topic: HelpTopic;
  onClick: (topic: HelpTopic) => void;
}) {
  return (
    <button
      className="btn btn-ghost btn-xs btn-circle opacity-40 hover:opacity-100"
      onClick={() => onClick(topic)}
      aria-label="Help"
      title="Help"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
      </svg>
    </button>
  );
}
