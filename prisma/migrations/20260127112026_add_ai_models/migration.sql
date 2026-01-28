/*
  Warnings:

  - You are about to drop the column `questionId` on the `AiCheckedAnswer` table. All the data in the column will be lost.
  - You are about to drop the column `studentAnswer` on the `AiCheckedAnswer` table. All the data in the column will be lost.
  - You are about to drop the column `userId` on the `AiCheckedAnswer` table. All the data in the column will be lost.
  - You are about to drop the column `sourceQuestionId` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Question` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `QuestionBank` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[attemptId]` on the table `AiCheckedAnswer` will be added. If there are existing duplicate values, this will fail.
  - Made the column `attemptId` on table `AiCheckedAnswer` required. This step will fail if there are existing NULL values in that column.
  - Made the column `bankId` on table `Question` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "AiAttemptStatus" AS ENUM ('IN_PROGRESS', 'CHECKING', 'DONE', 'FAILED');

-- DropForeignKey
ALTER TABLE "AiCheckedAnswer" DROP CONSTRAINT "AiCheckedAnswer_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "AiCheckedAnswer" DROP CONSTRAINT "AiCheckedAnswer_questionId_fkey";

-- DropForeignKey
ALTER TABLE "AiCheckedAnswer" DROP CONSTRAINT "AiCheckedAnswer_userId_fkey";

-- DropForeignKey
ALTER TABLE "Question" DROP CONSTRAINT "Question_sourceQuestionId_fkey";

-- DropIndex
DROP INDEX "AiCheckedAnswer_attemptId_idx";

-- DropIndex
DROP INDEX "AiCheckedAnswer_questionId_idx";

-- DropIndex
DROP INDEX "AiCheckedAnswer_userId_idx";

-- AlterTable
ALTER TABLE "AiCheckedAnswer" DROP COLUMN "questionId",
DROP COLUMN "studentAnswer",
DROP COLUMN "userId",
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "attemptId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Question" DROP COLUMN "sourceQuestionId",
DROP COLUMN "type",
ALTER COLUMN "bankId" SET NOT NULL;

-- AlterTable
ALTER TABLE "QuestionBank" DROP COLUMN "type";

-- DropEnum
DROP TYPE "BankType";

-- DropEnum
DROP TYPE "QuestionType";

-- CreateTable
CREATE TABLE "AiQuestion" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "prompt" TEXT NOT NULL,
    "answerKey" TEXT,
    "adminId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAttempt" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "aiQuestionId" TEXT NOT NULL,
    "studentAnswer" TEXT NOT NULL,
    "status" "AiAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "score" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiAttempt_userId_idx" ON "AiAttempt"("userId");

-- CreateIndex
CREATE INDEX "AiAttempt_aiQuestionId_idx" ON "AiAttempt"("aiQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "AiCheckedAnswer_attemptId_key" ON "AiCheckedAnswer"("attemptId");

-- CreateIndex
CREATE INDEX "AiCheckedAnswer_status_idx" ON "AiCheckedAnswer"("status");

-- AddForeignKey
ALTER TABLE "AiQuestion" ADD CONSTRAINT "AiQuestion_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAttempt" ADD CONSTRAINT "AiAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAttempt" ADD CONSTRAINT "AiAttempt_aiQuestionId_fkey" FOREIGN KEY ("aiQuestionId") REFERENCES "AiQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCheckedAnswer" ADD CONSTRAINT "AiCheckedAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AiAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
