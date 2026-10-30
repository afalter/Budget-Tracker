import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import { processDueOccurrencesForAccount } from "../lib/occurrenceProcessing";
import { calculateCurrentBalance } from "./projections";

const router = Router({ mergeParams: true });

// GET /api/accounts/:accountId/balance
router.get("/", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    try {
      await processDueOccurrencesForAccount(prisma, accountId);
    } catch (error) {
      console.error("Failed to process due occurrences:", error);
      res.status(503).json({
        code: "OCCURRENCE_PROCESSING_FAILED",
        error: "Failed to process due occurrences",
      });
      return;
    }
    const snapshot = await prisma.balanceSnapshot.findFirst({
      where: { accountId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });

    if (!snapshot) {
      res.json(null);
      return;
    }

    const today = new Date();
    const todayUTC = new Date(Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate(),
    ));
    const amount = await calculateCurrentBalance(prisma, accountId, snapshot, todayUTC);

    res.json({ ...snapshot, amount });
  } catch (error) {
    console.error("Failed to fetch balance:", error);
    res.status(500).json({ error: "Failed to fetch balance" });
  }
});

// POST /api/accounts/:accountId/balance
router.post("/", async (req: Request, res: Response) => {
  try {
    const { accountId } = req.params;
    const { amount } = req.body;

    if (amount === undefined || typeof amount !== "number") {
      res.status(400).json({ error: "amount is required and must be a number" });
      return;
    }

    const snapshot = await prisma.balanceSnapshot.create({
      data: { amount, accountId },
    });

    res.status(201).json(snapshot);
  } catch (error) {
    console.error("Failed to create balance snapshot:", error);
    res.status(500).json({ error: "Failed to create balance snapshot" });
  }
});

export default router;
