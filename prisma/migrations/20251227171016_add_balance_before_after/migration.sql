-- DropIndex
DROP INDEX "BalanceTransaction_adminId_createdAt_idx";

-- CreateIndex
CREATE INDEX "BalanceTransaction_adminId_idx" ON "BalanceTransaction"("adminId");
