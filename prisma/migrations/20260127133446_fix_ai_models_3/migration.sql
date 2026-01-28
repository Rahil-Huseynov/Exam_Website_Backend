/*
  Warnings:

  - You are about to drop the column `attemptId` on the `AiCheckedAnswer` table. All the data in the column will be lost.
  - The `status` column on the `AiCheckedAnswer` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `AiAttempt` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AiQuestion` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `attemptAnswerId` to the `AiCheckedAnswer` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AiStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "BankType" AS ENUM ('TEST', 'WRITING');

-- DropForeignKey
ALTER TABLE "AiAttempt" DROP CONSTRAINT "AiAttempt_aiQuestionId_fkey";

-- DropForeignKey
ALTER TABLE "AiAttempt" DROP CONSTRAINT "AiAttempt_userId_fkey";

-- DropForeignKey
ALTER TABLE "AiCheckedAnswer" DROP CONSTRAINT "AiCheckedAnswer_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "AiQuestion" DROP CONSTRAINT "AiQuestion_adminId_fkey";

-- DropIndex
DROP INDEX "AiCheckedAnswer_attemptId_key";

-- DropIndex
DROP INDEX "AiCheckedAnswer_status_idx";

-- AlterTable
ALTER TABLE "AiCheckedAnswer" DROP COLUMN "attemptId",
ADD COLUMN     "attemptAnswerId" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "AiStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AttemptAnswer" ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "score" INTEGER,
ADD COLUMN     "studentTextAnswer" TEXT;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "answerKey" TEXT,
ADD COLUMN     "createdByAdminId" INTEGER,
ADD COLUMN     "prompt" TEXT;

-- AlterTable
ALTER TABLE "QuestionBank" ADD COLUMN     "type" "BankType" NOT NULL DEFAULT 'TEST';

-- DropTable
DROP TABLE "AiAttempt";

-- DropTable
DROP TABLE "AiQuestion";

-- DropEnum
DROP TYPE "AiAttemptStatus";

-- DropEnum
DROP TYPE "AiCheckStatus";

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCheckedAnswer" ADD CONSTRAINT "AiCheckedAnswer_attemptAnswerId_fkey" FOREIGN KEY ("attemptAnswerId") REFERENCES "AttemptAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
