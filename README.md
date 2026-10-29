# Budget Tracker

**See where your money is going — and where it will be.**

A personal finance forecasting tool that projects your bank balance day-by-day based on your income and expenses. Manage multiple accounts, set up recurring transactions, transfer between accounts, and visualize everything with interactive charts. Built to run locally with Docker — your financial data never leaves your machine.

---

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Makefile Reference](#makefile-reference)
- [Common Workflows](#common-workflows)
- [Environment Variables](#environment-variables)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [License](#license)

---

## Features

**Multi-Account Management**
- Create and manage multiple accounts (checking, savings, etc.)
- Set up transfers between accounts — an expense in one appears as income in the other
- Switch between accounts instantly with the navbar dropdown

**Balance Projection Engine**
- Day-by-day balance simulation from today forward
- Supports 7 recurrence intervals: one-time, daily, weekly, biweekly, monthly, quarterly, yearly
- Toggle income/expenses on and off for instant what-if analysis
- Custom date range selection with presets (30d, 60d, 90d, 6mo, 1yr)

**5 Interactive Chart Views**
- **Projection** — area chart showing your balance trajectory over time
- **Spending by Category** — donut chart breaking down where your money goes
- **Income vs Expenses** — monthly side-by-side bar comparison
- **Cash Flow** — net monthly surplus/deficit with running total
- **Expense Trends** — stacked area chart showing category spending week-over-week
- **Fullscreen mode** — expand any chart to fill the screen, with interactive zoom (click-to-select range or drag sliders) and chart-specific controls (area/line, grouped/stacked, donut/pie, etc.)

**Ledger View**
- Detailed transaction-level table with daily balance tracking
- Filter by income, expenses, or events only
- Full-text search across all transactions
- Summary stats: total income, total expenses, net cash flow, ending balance

**Category System**
- Organize expenses by category with custom colors and descriptions
- Visual category picker with search when adding/editing expenses
- Category management modal for rename, recolor, describe, or delete
- Categories appear in charts and color-code the projection line

**Spreadsheet Exchange**
- Export all account data to a professionally formatted Excel workbook
- Modify data in Excel and re-import to update your budget
- Includes instructions sheet, data validation dropdowns, and color-coded tabs
- Round-trip safe: existing records update, new rows create, removed rows delete

**Actual Spending Tracker**
- Record real transactions as they hit your bank account
- Link actuals to forecast expenses — the projection uses the actual amount instead of the forecast
- Unlinked actuals appear as additional deductions
- Visual distinction in charts and ledger (amber "actual" badges)
- Compare what you planned to spend vs. what you actually spent

**Variable Pricing**
- Mark expenses as variable to track price changes over time
- Add price adjustments with dates and notes (e.g., rent increases)
- The projection engine uses the correct price for each date range

---

## Screenshots

### Balance Projection
![Dashboard with projection chart, income, and expenses](docs/screenshots/dashboard.png)
*Day-by-day balance forecast with category-colored line, income and expense panels*

### Spending by Category
![Donut chart showing expense breakdown by category](docs/screenshots/spending-pie.png)
*See where your money goes at a glance — transfers excluded*

### Income vs Expenses | Cash Flow
| ![Income vs Expenses](docs/screenshots/income-vs-expenses.png) | ![Cash Flow](docs/screenshots/cash-flow.png) |
|---|---|
| *Monthly income and expense comparison* | *Net surplus or deficit each month* |

### Expense Trends
![Expense trends stacked area chart](docs/screenshots/expense-trends.png)
*Weekly spending trends by category over time*

### Fullscreen with Zoom
![Fullscreen projection chart with tooltip and range sliders](docs/screenshots/fullscreen-chart.png)
*Expand any chart, zoom to a date range, toggle between Area and Line views*

### Ledger View | Built-in Help
| ![Ledger view](docs/screenshots/ledger-view.png) | ![Help panel](docs/screenshots/help-panel.png) |
|---|---|
| *Transaction-level detail with filters and search* | *11-topic help system with contextual navigation* |

---

## Quick Start

### Prerequisites

You need **Docker Desktop** (which includes Docker Compose) and **GNU Make**. Setup takes about 5 minutes.

**macOS:**

1. Install Docker Desktop: download from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) or run `brew install --cask docker`.
2. Launch Docker Desktop and wait for the whale icon to appear in the menu bar. It is ready when the icon stops animating.
3. GNU Make is pre-installed on macOS -- no action needed.

**Windows 11:**

1. Enable WSL 2 (required by Docker Desktop): open PowerShell as Administrator and run `wsl --install`, then restart your computer.
2. Install Docker Desktop: download from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/). During installation, ensure "Use WSL 2 based engine" is checked.
3. Launch Docker Desktop and accept the service agreement.
4. Install GNU Make: run `winget install GnuWin32.Make` in a terminal, or use Git Bash (included with [Git for Windows](https://gitforwindows.org/), which provides make).

**Before running `make dev`**, confirm Docker Desktop is running (not just installed). You can verify by opening a terminal and running:

```bash
docker --version
```

The first run downloads container images and installs dependencies, which takes a few minutes. Subsequent starts are fast.

### Setup

```bash
# 1. Clone the repository
git clone https://github.com/Dreddsparc/Budget-Tracker.git && cd Budget-Tracker

# 2. Create your environment file
cp .env.example .env

# 3. Start everything
make dev
```

That's it. Docker Compose builds both containers, starts PostgreSQL, runs database migrations, seeds a default account, and launches the app. Once you see output from all three services:

- **App**: http://localhost:5173
- **API**: http://localhost:3001

On first load, you'll be prompted to set your starting balance. From there, add income sources and expenses to see your projected balance over time.

To run in the background instead:

```bash
make up       # start detached
make logs     # follow the output
make down     # stop when done
```

---

## Documentation

Beyond this README, the project includes detailed documentation for both users and developers:

### For Users

The **[User Guide](docs/user/README.md)** covers everything you need to know to use Budget Tracker day-to-day:

- [Getting Started](docs/user/getting-started.md) — First-time setup walkthrough
- [Managing Accounts](docs/user/accounts.md) — Create, switch, rename, and delete accounts
- [Income Sources](docs/user/income.md) — Set up recurring and one-time income
- [Expenses](docs/user/expenses.md) — Track expenses with categories and variable pricing
- [Transfers](docs/user/transfers.md) — Move money between accounts
- [Charts](docs/user/charts.md) — Understand all 5 visualization types
- [Ledger View](docs/user/ledger.md) — Transaction-level detail with filters and search
- [Categories](docs/user/categories.md) — Organize and color-code your spending
- [Actual Spending](docs/user/actual-spending.md) — Track real transactions vs. forecasts
- [Spreadsheet Exchange](docs/user/spreadsheet.md) — Export to Excel, edit, and re-import
- [Tips and Workflows](docs/user/tips.md) — What-if analysis, common patterns, and power-user tips

### For Developers

The **[Developer Guide](docs/dev/README.md)** covers the architecture, APIs, and how to extend the project:

- [Architecture Overview](docs/dev/architecture.md) — System design, data flow, and tech stack
- [Database Schema](docs/dev/database.md) — All Prisma models, relations, and migration strategy
- [API Reference](docs/dev/api.md) — Complete REST API documentation
- [Projection Engine](docs/dev/projections-engine.md) — The core forecasting algorithm in detail
- [Client Architecture](docs/dev/client-architecture.md) — React component tree and state management
- [Adding Features](docs/dev/adding-features.md) — Step-by-step guides for common extensions
- [Spreadsheet Internals](docs/dev/spreadsheet.md) — How Excel export/import works
- [Docker Setup](docs/dev/docker.md) — Container configuration and local development
- [Testing](docs/dev/testing.md) — Testing strategy and recommendations

---

## Tech Stack

| Layer    | Technology                              |
|----------|-----------------------------------------|
| Frontend | React 19, TypeScript, Tailwind CSS v4, DaisyUI v5, Recharts |
| Backend  | Express, TypeScript, Prisma ORM         |
| Database | PostgreSQL 16                           |
| Infra    | Docker Compose                          |

---

## Project Structure

```
Budget-Tracker/
├── Makefile                    # All dev commands
├── docker-compose.yml          # Service definitions (db, server, client)
├── .env.example                # Environment template (copy to .env)
├── server/
│   ├── Dockerfile
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma       # Data models (Account, Income, Expense, etc.)
│   │   └── seed-accounts.ts    # Creates default account on first run
│   └── src/
│       ├── index.ts            # Express app + route mounting
│       ├── lib/prisma.ts       # Database client
│       └── routes/
│           ├── accounts.ts     # Account CRUD
│           ├── balance.ts      # Balance snapshots
│           ├── income.ts       # Income sources + incoming transfers
│           ├── expenses.ts     # Planned expenses + transfers + price adjustments
│           ├── actuals.ts      # Actual spending CRUD
│           ├── projections.ts  # Day-by-day balance forecast engine (integrates actuals)
│           ├── categories.ts   # Category management (global)
│           └── spreadsheet.ts  # Excel export/import
└── client/
    ├── Dockerfile
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx             # Root state management + account switching
        ├── api.ts              # Typed API client
        ├── types.ts            # Shared TypeScript interfaces
        ├── monthlyTotal.ts     # Current-month total calculation utility
        └── components/
            ├── ProjectionChart.tsx      # Balance area chart
            ├── SpendingPieChart.tsx     # Category donut chart
            ├── IncomeExpenseBarChart.tsx # Monthly comparison bars
            ├── CashFlowChart.tsx        # Net cash flow bars
            ├── ExpenseTrendChart.tsx    # Stacked spending trends
            ├── LedgerView.tsx          # Transaction table
            ├── IncomeList.tsx          # Forecast income panel
            ├── ExpenseList.tsx         # Forecast expenses panel
            ├── ActualSpendList.tsx     # Actual spending tracker panel
            ├── EntryForm.tsx           # Add/edit form with category picker
            ├── PriceSchedule.tsx       # Variable price management
            ├── SetBalanceModal.tsx      # Balance setup dialog
            ├── AccountManageModal.tsx   # Account CRUD modal
            ├── CategoryManageModal.tsx  # Category CRUD modal
            ├── SpreadsheetControls.tsx  # Excel export/import buttons
            └── DateRangeBar.tsx         # Date range presets + custom picker
```

---

## Makefile Reference

Run `make help` to see all available commands.

### Getting Started

| Command        | Description                                    |
|----------------|------------------------------------------------|
| `make dev`     | Start all services with live output (builds if needed) |
| `make up`      | Start all services in the background           |
| `make down`    | Stop all services                              |
| `make restart` | Stop and restart everything with a fresh build |

### Service Management

| Command              | Description                              |
|----------------------|------------------------------------------|
| `make build`         | Rebuild all containers without starting  |
| `make build-server`  | Rebuild only the server container        |
| `make build-client`  | Rebuild only the client container        |
| `make start-server`  | Start just the server + database         |
| `make start-client`  | Start just the client                    |
| `make stop-server`   | Stop the server container                |
| `make stop-client`   | Stop the client container                |
| `make status`        | Show running container status            |

### Logs

| Command            | Description                    |
|--------------------|--------------------------------|
| `make logs`        | Tail logs from all services    |
| `make logs-server` | Tail logs from the server only |
| `make logs-client` | Tail logs from the client only |
| `make logs-db`     | Tail logs from PostgreSQL only |

### Shell Access

| Command            | Description                              |
|--------------------|------------------------------------------|
| `make shell-server`| Open a shell inside the server container |
| `make shell-client`| Open a shell inside the client container |
| `make shell-db`    | Open a psql session in PostgreSQL        |

### Database

| Command                 | Description                                       |
|-------------------------|---------------------------------------------------|
| `make db-migrate`       | Run any pending Prisma migrations                 |
| `make db-migrate-create`| Create a new migration (after schema changes)     |
| `make db-reset`         | Drop and recreate the database (destroys all data)|
| `make db-studio`        | Open Prisma Studio (visual DB browser) on port 5555 |
| `make db-seed`          | Seed the database with sample data                |

### Local Development (without Docker)

| Command              | Description                                     |
|----------------------|-------------------------------------------------|
| `make install`       | Install npm dependencies for server and client  |
| `make install-server`| Install server dependencies only                |
| `make install-client`| Install client dependencies only                |
| `make typecheck`     | Run TypeScript type checking on both projects   |

### Cleanup

| Command              | Description                                              |
|----------------------|----------------------------------------------------------|
| `make clean`         | Stop services, remove containers                         |
| `make clean-volumes` | Same as clean + delete database volume (destroys data)   |
| `make clean-all`     | Full reset: containers, volumes, images, and node_modules|

---

## Common Workflows

### Starting fresh after pulling changes

```bash
make restart
```

### Viewing server logs while developing

```bash
make up              # start in background
make logs-server     # watch server output
```

### Modifying the database schema

1. Edit `server/prisma/schema.prisma`
2. Run `make db-migrate-create` to generate and apply a migration
3. The server auto-restarts and picks up the new schema

### Resetting everything to a clean state

```bash
make clean-all       # removes containers, data, images, node_modules
make dev             # rebuild from scratch
```

### Inspecting the database directly

```bash
make shell-db
# Now in psql:
\dt                          -- list tables
SELECT * FROM "IncomeSource";
SELECT * FROM "PlannedExpense";
\q                           -- exit
```

---

## Environment Variables

Configuration lives in `.env` at the project root (not committed to git). Copy the example file to get started:

```bash
cp .env.example .env
```

The defaults work out of the box for local development. **For any shared or production deployment, change the database credentials to strong, unique values.**

For local Vite development, an additional hostname can optionally be allowed by
adding `VITE_ALLOWED_HOST` to the root `.env` (the same file used by Docker
Compose). Use the hostname only, without `https://` or a path. Compose passes the
value to the client container at startup. If it is unset or empty, Vite keeps its
safe default local-development hosts. The root `.env.example` documents the variable
without containing a private hostname.

| Variable            | Default                                          | Description            |
|---------------------|--------------------------------------------------|------------------------|
| `DATABASE_URL`      | `postgresql://budget:budget@db:5432/budget_tracker` | Prisma connection string |
| `POSTGRES_USER`     | `budget`                                         | PostgreSQL username    |
| `POSTGRES_PASSWORD` | `budget`                                         | PostgreSQL password    |
| `POSTGRES_DB`       | `budget_tracker`                                 | PostgreSQL database name |
| `VITE_ALLOWED_HOST` | *(unset)*                                        | Optional additional hostname for the Vite development server |

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on reporting bugs, suggesting features, submitting code, and our privacy principles.

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a summary of all releases, or browse the [changelogs/](changelogs/) directory for detailed per-version notes.

| Version | Date | Highlights |
|---------|------|------------|
| [v1.2](changelogs/v1.2.md) | 2026-03-31 | Actual spending, fullscreen charts, help system, category management |
| [v1.0](changelogs/v1.0.md) | 2026-03-28 | Initial release — multi-account, projections, 5 charts, spreadsheet exchange |

---

## License

This project is open source. See the repository for license details.
