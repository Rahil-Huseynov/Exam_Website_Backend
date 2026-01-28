-- AlterTable
ALTER TABLE "AiCheckedAnswer" ADD COLUMN     "aiQuestionId" TEXT;

-- CreateTable
CREATE TABLE "AiQuestion" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "answerKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiQuestion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AiCheckedAnswer" ADD CONSTRAINT "AiCheckedAnswer_aiQuestionId_fkey" FOREIGN KEY ("aiQuestionId") REFERENCES "AiQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
