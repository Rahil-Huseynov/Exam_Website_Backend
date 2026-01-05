/*
  Warnings:

  - You are about to drop the column `phoneCode` on the `email_verifications` table. All the data in the column will be lost.
  - You are about to drop the column `phoneNumber` on the `email_verifications` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "email_verifications" DROP COLUMN "phoneCode",
DROP COLUMN "phoneNumber";
