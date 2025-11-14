/*
  Warnings:

  - A unique constraint covering the columns `[publicId]` on the table `allCarsList` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[publicId]` on the table `userJournal` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "allCarsList" ADD COLUMN     "publicId" TEXT;

-- AlterTable
ALTER TABLE "userJournal" ADD COLUMN     "publicId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "allCarsList_publicId_key" ON "allCarsList"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "userJournal_publicId_key" ON "userJournal"("publicId");
