/*
  Warnings:

  - The values [CHECKING,DONE,FAILED] on the enum `AiAttemptStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AiAttemptStatus_new" AS ENUM ('IN_PROGRESS', 'FINISHED');
ALTER TABLE "public"."AiAttempt" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "AiAttempt" ALTER COLUMN "status" TYPE "AiAttemptStatus_new" USING ("status"::text::"AiAttemptStatus_new");
ALTER TYPE "AiAttemptStatus" RENAME TO "AiAttemptStatus_old";
ALTER TYPE "AiAttemptStatus_new" RENAME TO "AiAttemptStatus";
DROP TYPE "public"."AiAttemptStatus_old";
ALTER TABLE "AiAttempt" ALTER COLUMN "status" SET DEFAULT 'IN_PROGRESS';
COMMIT;

-- AlterTable
ALTER TABLE "AiCheckedAnswer" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
