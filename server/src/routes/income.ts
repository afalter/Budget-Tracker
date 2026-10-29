import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { archiveIncomeSources } from "../lib/archiveRules";

const router = Router({ mergeParams: true });

// GET /api/accounts/:accountId/income
router.get("/", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const sources = await prisma.incomeSource.findMany({
      where: { accountId },
      orderBy: { createdAt: "desc" },
    });
    res.json(sources);
  } catch (error) {
    console.error("Failed to fetch income sources:", error);
    res.status(500).json({ error: "Failed to fetch income sources" });
  }
});

// POST /api/accounts/:accountId/income
router.post("/", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const { name, amount, interval, startDate } = req.body;

    if (!name || amount === undefined || !interval || !startDate) {
      res.status(400).json({
        error: "name, amount, interval, and startDate are required",
      });
      return;
    }

    const source = await prisma.incomeSource.create({
      data: {
        name,
        amount,
        interval,
        startDate: new Date(startDate),
        accountId,
      },
    });

    res.status(201).json(source);
  } catch (error) {
    console.error("Failed to create income source:", error);
    res.status(500).json({ error: "Failed to create income source" });
  }
});

// PUT /api/accounts/:accountId/income/:id
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { accountId, id } = req.params;
    const { name, amount, interval, startDate, active } = req.body;

    const existing = await prisma.incomeSource.findFirst({
      where: { id, accountId },
    });
    if (!existing) {
      res.status(404).json({ error: "Income source not found" });
      return;
    }

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (amount !== undefined) data.amount = amount;
    if (interval !== undefined) data.interval = interval;
    if (startDate !== undefined) data.startDate = new Date(startDate);
    if (active !== undefined) data.active = active;

    const source = await prisma.incomeSource.update({
      where: { id },
      data,
    });

    res.json(source);
  } catch (error) {
    console.error("Failed to update income source:", error);
    res.status(500).json({ error: "Failed to update income source" });
  }
});

// DELETE /api/accounts/:accountId/income/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { accountId, id } = req.params;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.incomeSource.findFirst({ where: { id, accountId } });
      if (!existing) throw new Error("Income source not found");
      await archiveIncomeSources(tx, [id], accountId);
    });
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === "Income source not found") {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error("Failed to delete income source:", error);
    res.status(500).json({ error: "Failed to delete income source" });
  }
});

// PATCH /api/accounts/:accountId/income/:id/toggle
router.patch("/:id/toggle", async (req: Request, res: Response) => {
  try {
    const { accountId, id } = req.params;

    const source = await prisma.incomeSource.findFirst({
      where: { id, accountId },
    });
    if (!source) {
      res.status(404).json({ error: "Income source not found" });
      return;
    }

    const updated = await prisma.incomeSource.update({
      where: { id },
      data: { active: !source.active },
    });

    res.json(updated);
  } catch (error) {
    console.error("Failed to toggle income source:", error);
    res.status(500).json({ error: "Failed to toggle income source" });
  }
});

// GET /api/accounts/:accountId/income/transfers — incoming transfers from other accounts
router.get("/transfers", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const transfers = await prisma.plannedExpense.findMany({
      where: {
        transferToAccountId: accountId,
        isTransfer: true,
        NOT: { accountId },
      },
      include: {
        account: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const mapped = transfers.map((t) => ({
      id: t.id,
      name: t.name,
      amount: t.amount,
      interval: t.interval,
      startDate: t.startDate,
      endDate: t.endDate,
      active: t.active,
      sourceAccountName: (t as unknown as { account: { name: string } }).account.name,
    }));

    res.json(mapped);
  } catch (error) {
    console.error("Failed to fetch incoming transfers:", error);
    res.status(500).json({ error: "Failed to fetch incoming transfers" });
  }
});

export default router;
