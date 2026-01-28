/*
  Warnings:

  - You are about to drop the column `questionId` on the `AiCheckedAnswer` table. All the data in the column will be lost.
  - Made the column `aiQuestionId` on table `AiCheckedAnswer` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "AiCheckedAnswer" DROP CONSTRAINT "AiCheckedAnswer_aiQuestionId_fkey";

-- DropForeignKey
ALTER TABLE "AiCheckedAnswer" DROP CONSTRAINT "AiCheckedAnswer_questionId_fkey";

-- DropIndex
DROP INDEX "AiCheckedAnswer_questionId_idx";

-- AlterTable
ALTER TABLE "AiCheckedAnswer" DROP COLUMN "questionId",
ADD COLUMN     "attemptId" TEXT,
ALTER COLUMN "aiQuestionId" SET NOT NULL;

-- AlterTable
ALTER TABLE "AiQuestion" ADD COLUMN     "sourceQuestionId" TEXT;

-- CreateTable
CREATE TABLE "AttemptAiQuestion" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "aiQuestionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttemptAiQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttemptAiQuestion_attemptId_idx" ON "AttemptAiQuestion"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "AttemptAiQuestion_attemptId_aiQuestionId_key" ON "AttemptAiQuestion"("attemptId", "aiQuestionId");

-- CreateIndex
CREATE INDEX "AiCheckedAnswer_aiQuestionId_idx" ON "AiCheckedAnswer"("aiQuestionId");

-- CreateIndex
CREATE INDEX "AiCheckedAnswer_attemptId_idx" ON "AiCheckedAnswer"("attemptId");

-- AddForeignKey
ALTER TABLE "AiQuestion" ADD CONSTRAINT "AiQuestion_sourceQuestionId_fkey" FOREIGN KEY ("sourceQuestionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCheckedAnswer" ADD CONSTRAINT "AiCheckedAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCheckedAnswer" ADD CONSTRAINT "AiCheckedAnswer_aiQuestionId_fkey" FOREIGN KEY ("aiQuestionId") REFERENCES "AiQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAiQuestion" ADD CONSTRAINT "AttemptAiQuestion_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAiQuestion" ADD CONSTRAINT "AttemptAiQuestion_aiQuestionId_fkey" FOREIGN KEY ("aiQuestionId") REFERENCES "AiQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
