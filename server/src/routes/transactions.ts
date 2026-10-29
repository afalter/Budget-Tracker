import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import {
  softDeleteActualTransaction,
  updateActualTransaction,
} from "../lib/actualTransactionService";

const router = Router({ mergeParams: true });

// PUT /api/accounts/:accountId/transactions/:id
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { accountId, id } = req.params;
    const { amount, note, occurredAt } = req.body;

    if (amount === undefined && note === undefined && occurredAt === undefined) {
      res.status(400).json({ error: "At least one field is required" });
      return;
    }
    if (amount !== undefined && (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0)) {
      res.status(400).json({ error: "amount must be a non-negative number" });
      return;
    }
    if (occurredAt !== undefined && (typeof occurredAt !== "string" || Number.isNaN(new Date(occurredAt).getTime()))) {
      res.status(400).json({ error: "occurredAt must be a valid date" });
      return;
    }

    const transaction = await updateActualTransaction(prisma, accountId, id, {
      amount,
      note: note === undefined ? undefined : note || null,
      occurredAt: occurredAt === undefined ? undefined : new Date(occurredAt),
    });
    res.json(transaction);
  } catch (error) {
    if (error instanceof Error && error.message === "Actual transaction not found") {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error("Failed to update actual transaction:", error);
    res.status(500).json({ error: "Failed to update actual transaction" });
  }
});

// DELETE /api/accounts/:accountId/transactions/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { accountId, id } = req.params;
    await softDeleteActualTransaction(prisma, accountId, id);
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === "Actual transaction not found") {
      res.status(404).json({ error: error.message });
      return;
    }
    console.error("Failed to delete actual transaction:", error);
    res.status(500).json({ error: "Failed to delete actual transaction" });
  }
});

export default router;