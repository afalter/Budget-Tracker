-- CreateEnum
CREATE TYPE "Interval" AS ENUM ('ONE_TIME', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalanceSnapshot" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "BalanceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncomeSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "interval" "Interval" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "IncomeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlannedExpense" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "interval" "Interval" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "category" TEXT,
    "isVariable" BOOLEAN NOT NULL DEFAULT false,
    "isTransfer" BOOLEAN NOT NULL DEFAULT false,
    "transferToAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "PlannedExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceAdjustment" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActualSpend" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "category" TEXT,
    "forecastExpenseId" TEXT,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActualSpend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryColor" (
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#ef4444',
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "CategoryColor_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "BalanceSnapshot_accountId_idx" ON "BalanceSnapshot"("accountId");

-- CreateIndex
CREATE INDEX "IncomeSource_accountId_idx" ON "IncomeSource"("accountId");

-- CreateIndex
CREATE INDEX "PlannedExpense_accountId_idx" ON "PlannedExpense"("accountId");

-- CreateIndex
CREATE INDEX "PlannedExpense_transferToAccountId_idx" ON "PlannedExpense"("transferToAccountId");

-- CreateIndex
CREATE INDEX "PriceAdjustment_expenseId_idx" ON "PriceAdjustment"("expenseId");

-- CreateIndex
CREATE INDEX "ActualSpend_accountId_idx" ON "ActualSpend"("accountId");

-- CreateIndex
CREATE INDEX "ActualSpend_accountId_date_idx" ON "ActualSpend"("accountId", "date");

-- CreateIndex
CREATE INDEX "ActualSpend_forecastExpenseId_idx" ON "ActualSpend"("forecastExpenseId");

-- AddForeignKey
ALTER TABLE "BalanceSnapshot" ADD CONSTRAINT "BalanceSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeSource" ADD CONSTRAINT "IncomeSource_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedExpense" ADD CONSTRAINT "PlannedExpense_transferToAccountId_fkey" FOREIGN KEY ("transferToAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlannedExpense" ADD CONSTRAINT "PlannedExpense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceAdjustment" ADD CONSTRAINT "PriceAdjustment_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "PlannedExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualSpend" ADD CONSTRAINT "ActualSpend_forecastExpenseId_fkey" FOREIGN KEY ("forecastExpenseId") REFERENCES "PlannedExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActualSpend" ADD CONSTRAINT "ActualSpend_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
