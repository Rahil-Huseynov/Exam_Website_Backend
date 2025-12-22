/*
  Warnings:

  - Added the required column `logo` to the `University` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "University" ADD COLUMN     "logo" TEXT NOT NULL;
