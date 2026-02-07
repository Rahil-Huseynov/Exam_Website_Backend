-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "oneTimeToken" TEXT,
ADD COLUMN     "tokenConsumed" BOOLEAN NOT NULL DEFAULT false;
