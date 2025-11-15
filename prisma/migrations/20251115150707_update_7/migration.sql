/*
  Warnings:

  - You are about to drop the column `userId` on the `email_verifications` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[email]` on the table `email_verifications` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `email` to the `email_verifications` table without a default value. This is not possible if the table is not empty.
  - Added the required column `hash` to the `email_verifications` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `email_verifications` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "email_verifications" DROP CONSTRAINT "email_verifications_userId_fkey";

-- DropIndex
DROP INDEX "email_verifications_userId_idx";

-- AlterTable
ALTER TABLE "email_verifications" DROP COLUMN "userId",
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "hash" TEXT NOT NULL,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "phoneCode" TEXT,
ADD COLUMN     "phoneNumber" TEXT,
ADD COLUMN     "role" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "email_verifications_email_key" ON "email_verifications"("email");
