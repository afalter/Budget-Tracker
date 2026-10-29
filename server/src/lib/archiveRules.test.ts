import { describe, expect, it, vi } from "vitest";
import { archiveIncomeSources, archivePlannedExpenses } from "./archiveRules";

describe("archive rule helpers", () => {
  it("cancels only planned income occurrences before deactivating sources", async () => {
    const tx = {
      occurrence: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      incomeSource: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as any;

    await archiveIncomeSources(tx, ["income-1"], "account-1");

    expect(tx.occurrence.updateMany).toHaveBeenCalledWith({
      where: {
        incomeSourceId: { in: ["income-1"] },
        accountId: "account-1",
        status: "PLANNED",
      },
      data: expect.objectContaining({ status: "CANCELLED", statusChangedAt: expect.any(Date) }),
    });
    expect(tx.incomeSource.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["income-1"] }, accountId: "account-1" },
      data: { active: false },
    });
  });

  it("cancels only planned expense occurrences before deactivating expenses", async () => {
    const tx = {
      occurrence: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      plannedExpense: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    } as any;

    await archivePlannedExpenses(tx, ["expense-1"]);

    expect(tx.occurrence.updateMany).toHaveBeenCalledWith({
      where: { plannedExpenseId: { in: ["expense-1"] }, status: "PLANNED" },
      data: expect.objectContaining({ status: "CANCELLED", statusChangedAt: expect.any(Date) }),
    });
    expect(tx.plannedExpense.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["expense-1"] } },
      data: { active: false },
    });
  });
});
