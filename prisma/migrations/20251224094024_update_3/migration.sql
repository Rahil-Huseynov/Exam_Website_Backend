/*
  Warnings:

  - Added the required column `price` to the `QuestionBank` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subjectId` to the `QuestionBank` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `QuestionBank` table without a default value. This is not possible if the table is not empty.
  - Added the required column `universityId` to the `QuestionBank` table without a default value. This is not possible if the table is not empty.
  - Added the required column `year` to the `QuestionBank` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "QuestionBank" ADD COLUMN     "price" DECIMAL(10,2) NOT NULL,
ADD COLUMN     "subjectId" TEXT NOT NULL,
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "universityId" TEXT NOT NULL,
ADD COLUMN     "year" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "University" ADD COLUMN     "nameAz" TEXT,
ADD COLUMN     "nameEn" TEXT,
ADD COLUMN     "nameRu" TEXT,
ALTER COLUMN "logo" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAz" TEXT,
    "nameEn" TEXT,
    "nameRu" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionBank_universityId_subjectId_year_idx" ON "QuestionBank"("universityId", "subjectId", "year");

-- AddForeignKey
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionBank" ADD CONSTRAINT "QuestionBank_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
