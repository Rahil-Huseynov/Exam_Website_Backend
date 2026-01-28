/*
  Warnings:

  - You are about to drop the `AttemptAiQuestion` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AttemptAiQuestion" DROP CONSTRAINT "AttemptAiQuestion_aiQuestionId_fkey";

-- DropForeignKey
ALTER TABLE "AttemptAiQuestion" DROP CONSTRAINT "AttemptAiQuestion_attemptId_fkey";

-- DropTable
DROP TABLE "AttemptAiQuestion";
