-- CreateTable
CREATE TABLE "QuestionOptionImage" (
    "id" TEXT NOT NULL,
    "questionOptionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "urlHash" VARCHAR(64) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionOptionImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionOptionImage_questionOptionId_idx" ON "QuestionOptionImage"("questionOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionOptionImage_questionOptionId_urlHash_key" ON "QuestionOptionImage"("questionOptionId", "urlHash");

-- AddForeignKey
ALTER TABLE "QuestionOptionImage" ADD CONSTRAINT "QuestionOptionImage_questionOptionId_fkey" FOREIGN KEY ("questionOptionId") REFERENCES "QuestionOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
