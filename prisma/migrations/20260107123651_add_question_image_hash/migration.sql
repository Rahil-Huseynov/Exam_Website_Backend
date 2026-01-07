/*
  Warnings:

  - A unique constraint covering the columns `[questionId,urlHash]` on the table `QuestionImage` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `urlHash` to the `QuestionImage` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "QuestionImage_questionId_url_key";

-- AlterTable
ALTER TABLE "QuestionImage" ADD COLUMN     "urlHash" VARCHAR(64) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "QuestionImage_questionId_urlHash_key" ON "QuestionImage"("questionId", "urlHash");
