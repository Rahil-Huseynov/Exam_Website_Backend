/*
  Warnings:

  - You are about to alter the column `balance` on the `users` table. The data in that column could be lost. The data in that column will be cast from `Integer` to `Decimal(10,2)`.

*/
-- AlterTable
ALTER TABLE "users" ALTER COLUMN "balance" SET DEFAULT 0.00,
ALTER COLUMN "balance" SET DATA TYPE DECIMAL(10,2);
