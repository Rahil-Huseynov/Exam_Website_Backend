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

-- AddForeignKey
ALTER TABLE "AttemptAiQuestion" ADD CONSTRAINT "AttemptAiQuestion_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAiQuestion" ADD CONSTRAINT "AttemptAiQuestion_aiQuestionId_fkey" FOREIGN KEY ("aiQuestionId") REFERENCES "AiQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
