/*
  Warnings:

  - You are about to drop the column `content` on the `News` table. All the data in the column will be lost.
  - You are about to drop the column `lang` on the `News` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `News` table. All the data in the column will be lost.
  - Added the required column `contentAz` to the `News` table without a default value. This is not possible if the table is not empty.
  - Added the required column `titleAz` to the `News` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "News_lang_idx";

-- AlterTable
ALTER TABLE "News" DROP COLUMN "content",
DROP COLUMN "lang",
DROP COLUMN "title",
ADD COLUMN     "contentAz" TEXT NOT NULL,
ADD COLUMN     "contentEn" TEXT,
ADD COLUMN     "contentRu" TEXT,
ADD COLUMN     "titleAz" TEXT NOT NULL,
ADD COLUMN     "titleEn" TEXT,
ADD COLUMN     "titleRu" TEXT;
