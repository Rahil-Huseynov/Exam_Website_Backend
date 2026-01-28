-- CreateEnum
CREATE TYPE "AiCheckStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "AiCheckedAnswer" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "questionId" TEXT NOT NULL,
    "studentAnswer" TEXT NOT NULL,
    "score" INTEGER,
    "feedback" TEXT,
    "status" "AiCheckStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCheckedAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiCheckedAnswer_userId_idx" ON "AiCheckedAnswer"("userId");

-- CreateIndex
CREATE INDEX "AiCheckedAnswer_questionId_idx" ON "AiCheckedAnswer"("questionId");

-- AddForeignKey
ALTER TABLE "AiCheckedAnswer" ADD CONSTRAINT "AiCheckedAnswer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCheckedAnswer" ADD CONSTRAINT "AiCheckedAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
