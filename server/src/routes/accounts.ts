import { Router, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import prisma from "../lib/prisma";

const router = Router();

// GET /api/accounts
router.get("/", async (_req: Request, res: Response) => {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: { createdAt: "asc" },
    });
    res.json(accounts);
  } catch (error) {
    console.error("Failed to fetch accounts:", error);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

// POST /api/accounts
router.post("/", async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: "Account name is required" });
      return;
    }
    const account = await prisma.account.create({
      data: { name: String(name).trim() },
    });
    res.status(201).json(account);
  } catch (error) {
    console.error("Failed to create account:", error);
    res.status(500).json({ error: "Failed to create account" });
  }
});

// PUT /api/accounts/:id
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    if (!name || !String(name).trim()) {
      res.status(400).json({ error: "Account name is required" });
      return;
    }
    const account = await prisma.account.update({
      where: { id },
      data: { name: String(name).trim() },
    });
    res.json(account);
  } catch (error) {
    console.error("Failed to update account:", error);
    res.status(500).json({ error: "Failed to update account" });
  }
});

// DELETE /api/accounts/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${id} FOR UPDATE`;

      const count = await tx.account.count();
      if (count <= 1) throw new Error("Cannot delete the last account");

      const [occurrenceRows, transactionRows] = await Promise.all([
        tx.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "Occurrence" WHERE "accountId" = ${id}`,
        tx.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*)::bigint AS count FROM "ActualTransaction" WHERE "accountId" = ${id}`,
      ]);
      const occurrenceCount = Number(occurrenceRows[0]?.count ?? 0);
      const transactionCount = Number(transactionRows[0]?.count ?? 0);
      if (occurrenceCount > 0 || transactionCount > 0) {
        throw new Error("Cannot delete an account with historical occurrences or transactions");
      }

      await tx.account.delete({ where: { id } });
    });
    res.status(204).send();
  } catch (error) {
    if (error instanceof Error && error.message === "Cannot delete the last account") {
      res.status(400).json({ error: error.message });
      return;
    }
    if (error instanceof Error && error.message === "Cannot delete an account with historical occurrences or transactions") {
      res.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      res.status(409).json({ error: "Cannot delete an account with dependent data" });
      return;
    }
    console.error("Failed to delete account:", error);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

export default router;
