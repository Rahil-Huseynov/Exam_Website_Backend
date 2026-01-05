-- CreateTable
CREATE TABLE "ExamToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "ExamToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExamToken_token_key" ON "ExamToken"("token");

-- CreateIndex
CREATE INDEX "ExamToken_bankId_userId_idx" ON "ExamToken"("bankId", "userId");

-- AddForeignKey
ALTER TABLE "ExamToken" ADD CONSTRAINT "ExamToken_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "QuestionBank"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamToken" ADD CONSTRAINT "ExamToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
