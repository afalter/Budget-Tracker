import express from "express";
import cors from "cors";
import accountsRoutes from "./routes/accounts";
import balanceRoutes from "./routes/balance";
import incomeRoutes from "./routes/income";
import expensesRoutes from "./routes/expenses";
import projectionsRoutes from "./routes/projections";
import categoriesRoutes from "./routes/categories";
import actualsRoutes from "./routes/actuals";
import spreadsheetRoutes from "./routes/spreadsheet";
import transactionsRoutes from "./routes/transactions";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Account management (global)
app.use("/api/accounts", accountsRoutes);

// Account-scoped routes
app.use("/api/accounts/:accountId/balance", balanceRoutes);
app.use("/api/accounts/:accountId/income", incomeRoutes);
app.use("/api/accounts/:accountId/expenses", expensesRoutes);
app.use("/api/accounts/:accountId/actuals", actualsRoutes);
app.use("/api/accounts/:accountId/projections", projectionsRoutes);
app.use("/api/accounts/:accountId/spreadsheet", spreadsheetRoutes);
app.use("/api/accounts/:accountId/transactions", transactionsRoutes);

// Global routes
app.use("/api/categories", categoriesRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
