/*
  Warnings:

  - A unique constraint covering the columns `[attemptId]` on the table `ExamToken` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "ExamToken" ADD COLUMN     "attemptId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ExamToken_attemptId_key" ON "ExamToken"("attemptId");

-- AddForeignKey
ALTER TABLE "ExamToken" ADD CONSTRAINT "ExamToken_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
