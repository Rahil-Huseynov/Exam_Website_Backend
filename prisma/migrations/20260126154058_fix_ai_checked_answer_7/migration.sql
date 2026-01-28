/*
  Warnings:

  - You are about to drop the column `aiQuestionId` on the `AiCheckedAnswer` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Attempt` table. All the data in the column will be lost.
  - You are about to drop the `AiQuestion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AttemptAiQuestion` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `questionId` to the `AiCheckedAnswer` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "BankType" AS ENUM ('TEST', 'WRITING');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('MULTIPLE_CHOICE', 'OPEN_ENDED');

-- DropForeignKey
ALTER TABLE "AiCheckedAnswer" DROP CONSTRAINT "AiCheckedAnswer_aiQuestionId_fkey";

-- DropForeignKey
ALTER TABLE "AiQuestion" DROP CONSTRAINT "AiQuestion_sourceQuestionId_fkey";

-- DropForeignKey
ALTER TABLE "AttemptAiQuestion" DROP CONSTRAINT "AttemptAiQuestion_aiQuestionId_fkey";

-- DropForeignKey
ALTER TABLE "AttemptAiQuestion" DROP CONSTRAINT "AttemptAiQuestion_attemptId_fkey";

-- DropIndex
DROP INDEX "AiCheckedAnswer_aiQuestionId_idx";

-- AlterTable
ALTER TABLE "AiCheckedAnswer" DROP COLUMN "aiQuestionId",
ADD COLUMN     "questionId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Attempt" DROP COLUMN "type";

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "sourceQuestionId" TEXT,
ADD COLUMN     "type" "QuestionType" NOT NULL DEFAULT 'MULTIPLE_CHOICE',
ALTER COLUMN "bankId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "QuestionBank" ADD COLUMN     "type" "BankType" NOT NULL DEFAULT 'TEST';

-- DropTable
DROP TABLE "AiQuestion";

-- DropTable
DROP TABLE "AttemptAiQuestion";

-- CreateIndex
CREATE INDEX "AiCheckedAnswer_questionId_idx" ON "AiCheckedAnswer"("questionId");

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_sourceQuestionId_fkey" FOREIGN KEY ("sourceQuestionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCheckedAnswer" ADD CONSTRAINT "AiCheckedAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
