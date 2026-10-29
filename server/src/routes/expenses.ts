import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { archivePlannedExpenses } from "../lib/archiveRules";

const router = Router({ mergeParams: true });

// GET /api/accounts/:accountId/expenses
router.get("/", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const expenses = await prisma.plannedExpense.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
      include: { priceAdjustments: { orderBy: { startDate: "asc" } } },
    });
    res.json(expenses);
  } catch (error) {
    console.error("Failed to fetch expenses:", error);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

// POST /api/accounts/:accountId/expenses
router.post("/", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const { name, amount, interval, startDate, endDate, category, isVariable, isTransfer, transferToAccountId } = req.body;

    if (!name || amount === undefined || !interval || !startDate) {
      res.status(400).json({
        error: "name, amount, interval, and startDate are required",
      });
      return;
    }

    if (isTransfer && transferToAccountId) {
      if (transferToAccountId === accountId) {
        res.status(400).json({ error: "Cannot transfer to the same account" });
        return;
      }
      const targetExists = await prisma.account.findUnique({ where: { id: transferToAccountId } });
      if (!targetExists) {
        res.status(400).json({ error: "Transfer target account not found" });
        return;
      }
    }

    const expense = await prisma.plannedExpense.create({
      data: {
        name,
        amount,
        interval,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
        category: category || null,
        isVariable: isVariable ?? false,
        isTransfer: isTransfer ?? false,
        transferToAccountId: isTransfer ? transferToAccountId || null : null,
        accountId,
      },
      include: { priceAdjustments: { orderBy: { startDate: "asc" } } },
    });

    res.status(201).json(expense);
  } catch (error) {
    console.error("Failed to create expense:", error);
    res.status(500).json({ error: "Failed to create expense" });
  }
});

// PUT /api/accounts/:accountId/expenses/:id
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { accountId, id } = req.params;
    const { name, amount, interval, startDate, endDate, category, active, isVariable, isTransfer, transferToAccountId } =
      req.body;

    const existing = await prisma.plannedExpense.findFirst({
      where: { id, accountId },
    });
    if (!existing) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }

    if (isTransfer && transferToAccountId && transferToAccountId === accountId) {
      res.status(400).json({ error: "Cannot transfer to the same account" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (amount !== undefined) data.amount = amount;
    if (interval !== undefined) data.interval = interval;
    if (startDate !== undefined) data.startDate = new Date(startDate);
    if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;
    if (category !== undefined) data.category = category;
    if (active !== undefined) data.active = active;
    if (isVariable !== undefined) data.isVariable = isVariable;
    if (isTransfer !== undefined) {
      data.isTransfer = isTransfer;
      if (!isTransfer) {
        data.transferToAccountId = null;
      }
    }
    if (transferToAccountId !== undefined) data.transferToAccountId = transferToAccountId || null;

    const expense = await prisma.plannedExpense.update({
      where: { id },
      data,
      include: { priceAdjustments: { orderBy: { startDate: "asc" } } },
    });

    res.json(expense);
  } catch (error) {
    console.error("Failed to update expense:", error);
    res.status(500).json({ error: "Failed to update expense" });
  }
});

// DELETE /api/accounts/:accountId/expenses/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { accountId, id } = req.params;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.plannedExpense.findFirst({ where: { id, accountId } });
      if (!existing) throw new Error("Expense not found");
      await archivePlannedExpenses(tx, [id], accountId);
    });
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === "Expense not found") {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error("Failed to delete expense:", error);
    res.status(500).json({ error: "Failed to delete expense" });
  }
});

// PATCH /api/accounts/:accountId/expenses/:id/toggle
router.patch("/:id/toggle", async (req: Request, res: Response) => {
  try {
    const { accountId, id } = req.params;

    const expense = await prisma.plannedExpense.findFirst({
      where: { id, accountId },
    });
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }

    const updated = await prisma.plannedExpense.update({
      where: { id },
      data: { active: !expense.active },
      include: { priceAdjustments: { orderBy: { startDate: "asc" } } },
    });

    res.json(updated);
  } catch (error) {
    console.error("Failed to toggle expense:", error);
    res.status(500).json({ error: "Failed to toggle expense" });
  }
});

// GET /api/accounts/:accountId/expenses/:id/prices
router.get("/:id/prices", async (req: Request, res: Response) => {
  try {
    const { accountId, id } = req.params;

    const expense = await prisma.plannedExpense.findFirst({
      where: { id, accountId },
    });
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }

    const adjustments = await prisma.priceAdjustment.findMany({
      where: { expenseId: id },
      orderBy: { startDate: "asc" },
    });

    res.json(adjustments);
  } catch (error) {
    console.error("Failed to fetch price adjustments:", error);
    res.status(500).json({ error: "Failed to fetch price adjustments" });
  }
});

// POST /api/accounts/:accountId/expenses/:id/prices
router.post("/:id/prices", async (req: Request, res: Response) => {
  try {
    const { accountId, id } = req.params;
    const { amount, startDate, note } = req.body;

    if (amount === undefined || !startDate) {
      res.status(400).json({ error: "amount and startDate are required" });
      return;
    }

    const expense = await prisma.plannedExpense.findFirst({
      where: { id, accountId },
    });
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }

    const adjustment = await prisma.priceAdjustment.create({
      data: {
        expenseId: id,
        amount,
        startDate: new Date(startDate),
        note: note || null,
      },
    });

    res.status(201).json(adjustment);
  } catch (error) {
    console.error("Failed to create price adjustment:", error);
    res.status(500).json({ error: "Failed to create price adjustment" });
  }
});

// PUT /api/accounts/:accountId/expenses/:expenseId/prices/:priceId
router.put("/:expenseId/prices/:priceId", async (req: Request, res: Response) => {
  try {
    const { accountId, expenseId, priceId } = req.params;
    const { amount, startDate, note } = req.body;

    const expense = await prisma.plannedExpense.findFirst({
      where: { id: expenseId, accountId },
    });
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }

    const existing = await prisma.priceAdjustment.findFirst({
      where: { id: priceId, expenseId },
    });
    if (!existing) {
      res.status(404).json({ error: "Price adjustment not found" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (amount !== undefined) data.amount = amount;
    if (startDate !== undefined) data.startDate = new Date(startDate);
    if (note !== undefined) data.note = note || null;

    const adjustment = await prisma.priceAdjustment.update({
      where: { id: priceId },
      data,
    });

    res.json(adjustment);
  } catch (error) {
    console.error("Failed to update price adjustment:", error);
    res.status(500).json({ error: "Failed to update price adjustment" });
  }
});

// DELETE /api/accounts/:accountId/expenses/:expenseId/prices/:priceId
router.delete("/:expenseId/prices/:priceId", async (req: Request, res: Response) => {
  try {
    const { accountId, expenseId, priceId } = req.params;

    const expense = await prisma.plannedExpense.findFirst({
      where: { id: expenseId, accountId },
    });
    if (!expense) {
      res.status(404).json({ error: "Expense not found" });
      return;
    }

    const existing = await prisma.priceAdjustment.findFirst({
      where: { id: priceId, expenseId },
    });
    if (!existing) {
      res.status(404).json({ error: "Price adjustment not found" });
      return;
    }

    await prisma.priceAdjustment.delete({ where: { id: priceId } });
    res.status(204).send();
  } catch (error) {
    console.error("Failed to delete price adjustment:", error);
    res.status(500).json({ error: "Failed to delete price adjustment" });
  }
});

export default router;
